import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model } from 'mongoose';
import { AgentStatus } from '../../common/enums/agent-status.enum';
import { Agent } from '../../database/schemas/agent.schema';
import {
  AiActionProposal,
  AiActionProposalStatus,
  AiActionTargetType,
  AiActionType,
  AiProposalSourceType,
} from '../../database/schemas/ai-action-proposal.schema';

export type AiActionProposalListFilters = {
  status?: AiActionProposalStatus;
  actionType?: AiActionType;
  proposedByAgentId?: string;
  sourceId?: string;
  sourceType?: AiProposalSourceType;
};

export type AiActionCenterFilters = {
  status: AiActionProposalStatus;
  sourceType?: AiProposalSourceType;
  taskLimit: number;
  meetingLimit: number;
};

@Injectable()
export class AiActionsRepository {
  constructor(
    @InjectModel(AiActionProposal.name)
    private readonly model: Model<AiActionProposal>,
    @InjectModel(Agent.name)
    private readonly agents: Model<Agent>,
  ) {}

  findActiveAgent(id: string) {
    return this.agents
      .findOne({
        _id: id,
        $or: [{ status: AgentStatus.ACTIVE }, { status: { $exists: false } }],
      })
      .lean()
      .exec();
  }

  create(input: Record<string, unknown>) {
    return this.model.create(input);
  }

  findByProposalIdWithHash(organizationId: string, proposalId: string) {
    return this.model
      .findOne({ organizationId, proposalId })
      .select('+proposalHash')
      .lean()
      .exec();
  }

  findById(organizationId: string, id: string) {
    return this.model.findOne({ _id: id, organizationId }).lean().exec();
  }

  async list(
    organizationId: string,
    page: number,
    limit: number,
    filters: AiActionProposalListFilters,
  ) {
    const query: FilterQuery<AiActionProposal> = {
      organizationId,
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.actionType ? { actionType: filters.actionType } : {}),
      ...(filters.proposedByAgentId
        ? { 'proposedByAgent.id': filters.proposedByAgentId }
        : {}),
      ...(filters.sourceId ? { 'source.id': filters.sourceId } : {}),
      ...(filters.sourceType ? { 'source.type': filters.sourceType } : {}),
    };
    const [items, total] = await Promise.all([
      this.model
        .find(query)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean()
        .exec(),
      this.model.countDocuments(query).exec(),
    ]);
    return {
      items,
      total,
      page,
      limit,
      pages: Math.max(Math.ceil(total / limit), 1),
    };
  }

  async getActionCenter(
    organizationId: string,
    sourceId: string,
    filters: AiActionCenterFilters,
  ) {
    const baseQuery: FilterQuery<AiActionProposal> = {
      organizationId,
      'source.id': sourceId,
      status: filters.status,
      ...(filters.sourceType ? { 'source.type': filters.sourceType } : {}),
    };
    const taskQuery = {
      ...baseQuery,
      actionType: AiActionType.CREATE_TASK,
    };
    const meetingQuery = {
      ...baseQuery,
      actionType: AiActionType.SCHEDULE_MEETING,
    };

    const [priorityTasks, meetingSchedules, taskTotal, meetingTotal] =
      await Promise.all([
        this.model
          .aggregate([
            { $match: taskQuery },
            {
              $addFields: {
                __priorityRank: {
                  $switch: {
                    branches: [
                      { case: { $eq: ['$payload.priority', 'HIGH'] }, then: 3 },
                      {
                        case: { $eq: ['$payload.priority', 'MEDIUM'] },
                        then: 2,
                      },
                      { case: { $eq: ['$payload.priority', 'LOW'] }, then: 1 },
                    ],
                    default: 2,
                  },
                },
                __dueDate: {
                  $ifNull: [
                    {
                      $convert: {
                        input: '$payload.dueDate',
                        to: 'date',
                        onError: null,
                        onNull: null,
                      },
                    },
                    new Date('9999-12-31T23:59:59.999Z'),
                  ],
                },
              },
            },
            { $sort: { __priorityRank: -1, __dueDate: 1, createdAt: -1 } },
            { $limit: filters.taskLimit },
            { $project: { proposalHash: 0, __priorityRank: 0, __dueDate: 0 } },
          ])
          .exec(),
        this.model
          .aggregate([
            { $match: meetingQuery },
            {
              $addFields: {
                __startsAt: {
                  $ifNull: [
                    {
                      $convert: {
                        input: '$payload.startsAt',
                        to: 'date',
                        onError: null,
                        onNull: null,
                      },
                    },
                    new Date('9999-12-31T23:59:59.999Z'),
                  ],
                },
              },
            },
            { $sort: { __startsAt: 1, createdAt: -1 } },
            { $limit: filters.meetingLimit },
            { $project: { proposalHash: 0, __startsAt: 0 } },
          ])
          .exec(),
        this.model.countDocuments(taskQuery).exec(),
        this.model.countDocuments(meetingQuery).exec(),
      ]);

    return {
      priorityTasks,
      meetingSchedules,
      totals: {
        priorityTasks: taskTotal,
        meetingSchedules: meetingTotal,
      },
    };
  }

  approvePending(
    organizationId: string,
    id: string,
    reviewer: { id: string; name: string },
  ) {
    const now = new Date();
    return this.model
      .findOneAndUpdate(
        {
          _id: id,
          organizationId,
          status: AiActionProposalStatus.PENDING,
        },
        {
          $set: {
            status: AiActionProposalStatus.APPROVED,
            approvedByUserId: reviewer.id,
            approvedByUserName: reviewer.name,
            approvedAt: now,
          },
        },
        { new: true, runValidators: true },
      )
      .lean()
      .exec();
  }

  claimApprovedForExecution(organizationId: string, id: string) {
    return this.model
      .findOneAndUpdate(
        {
          _id: id,
          organizationId,
          status: AiActionProposalStatus.APPROVED,
          approvedByUserId: { $exists: true },
        },
        {
          $set: {
            status: AiActionProposalStatus.EXECUTING,
            executionStartedAt: new Date(),
          },
          $unset: { executionError: 1 },
        },
        { new: true, runValidators: true },
      )
      .lean()
      .exec();
  }

  claimFailedForRetry(organizationId: string, id: string) {
    return this.model
      .findOneAndUpdate(
        {
          _id: id,
          organizationId,
          status: AiActionProposalStatus.FAILED,
          approvedByUserId: { $exists: true },
        },
        {
          $set: {
            status: AiActionProposalStatus.EXECUTING,
            executionStartedAt: new Date(),
          },
          $unset: { executionError: 1 },
          $inc: { retryCount: 1 },
        },
        { new: true, runValidators: true },
      )
      .lean()
      .exec();
  }

  rejectPending(
    organizationId: string,
    id: string,
    reviewer: { id: string; name: string },
    reason: string,
  ) {
    return this.model
      .findOneAndUpdate(
        {
          _id: id,
          organizationId,
          status: AiActionProposalStatus.PENDING,
        },
        {
          $set: {
            status: AiActionProposalStatus.REJECTED,
            rejectedByUserId: reviewer.id,
            rejectedByUserName: reviewer.name,
            rejectedAt: new Date(),
            rejectionReason: reason,
          },
        },
        { new: true, runValidators: true },
      )
      .lean()
      .exec();
  }

  startClarificationRefinement(
    organizationId: string,
    id: string,
    clarificationAnswers: Record<string, string>,
  ) {
    return this.model
      .findOneAndUpdate(
        {
          _id: id,
          organizationId,
          status: AiActionProposalStatus.NEEDS_CLARIFICATION,
        },
        {
          $set: {
            status: AiActionProposalStatus.ANALYZING,
            clarificationAnswers,
          },
        },
        { new: true, runValidators: true },
      )
      .lean()
      .exec();
  }

  restoreClarificationAfterRefinementFailure(
    organizationId: string,
    id: string,
  ) {
    return this.model
      .findOneAndUpdate(
        {
          _id: id,
          organizationId,
          status: AiActionProposalStatus.ANALYZING,
        },
        { $set: { status: AiActionProposalStatus.NEEDS_CLARIFICATION } },
        { new: true, runValidators: true },
      )
      .lean()
      .exec();
  }

  applyClarificationResult(
    organizationId: string,
    id: string,
    input: {
      payload: Record<string, unknown>;
      confidence: number;
      evidence: unknown[];
      proposedByAgent: unknown;
      clarificationQuestions: unknown[];
      status: AiActionProposalStatus;
    },
  ) {
    return this.model
      .findOneAndUpdate(
        {
          _id: id,
          organizationId,
          status: AiActionProposalStatus.ANALYZING,
        },
        {
          $set: {
            ...input,
          },
          $inc: { revision: 1 },
        },
        { new: true, runValidators: true },
      )
      .lean()
      .exec();
  }

  markExecuted(
    organizationId: string,
    id: string,
    target: { type: AiActionTargetType; id: string },
  ) {
    return this.model
      .findOneAndUpdate(
        {
          _id: id,
          organizationId,
          status: AiActionProposalStatus.EXECUTING,
        },
        {
          $set: {
            status: AiActionProposalStatus.EXECUTED,
            executedBy: 'NOLTRA_BACKEND',
            executedAt: new Date(),
            targetResourceType: target.type,
            targetResourceId: target.id,
          },
          $unset: { executionError: 1 },
        },
        { new: true, runValidators: true },
      )
      .lean()
      .exec();
  }

  markFailed(organizationId: string, id: string, message: string) {
    return this.model
      .findOneAndUpdate(
        {
          _id: id,
          organizationId,
          status: AiActionProposalStatus.EXECUTING,
        },
        {
          $set: {
            status: AiActionProposalStatus.FAILED,
            executionError: message,
          },
        },
        { new: true, runValidators: true },
      )
      .lean()
      .exec();
  }
}
