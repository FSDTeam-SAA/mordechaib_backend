import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  AiActionProposal,
  AiActionProposalStatus,
} from '../../database/schemas/ai-action-proposal.schema';
import { TaskItem } from '../../database/schemas/task-item.schema';
import { TaskStatus } from '../../common/enums/task-status.enum';

@Injectable()
export class AgentWorkforceRepository {
  constructor(
    @InjectModel(AiActionProposal.name)
    private readonly proposals: Model<AiActionProposal>,
    @InjectModel(TaskItem.name)
    private readonly tasks: Model<TaskItem>,
  ) {}

  async proposalMetrics(
    organizationId: string,
    agentIds: string[],
    range: { from: Date; to: Date },
  ) {
    return this.proposals
      .aggregate<{
        agentId: string;
        total: number;
        approved: number;
        rejected: number;
        executed: number;
        failed: number;
      }>([
        {
          $match: {
            organizationId,
            'proposedByAgent.id': { $in: agentIds },
            createdAt: { $gte: range.from, $lt: range.to },
          },
        },
        {
          $group: {
            _id: '$proposedByAgent.id',
            total: { $sum: 1 },
            approved: {
              $sum: {
                $cond: [
                  {
                    $in: [
                      '$status',
                      [
                        AiActionProposalStatus.APPROVED,
                        AiActionProposalStatus.EXECUTING,
                        AiActionProposalStatus.EXECUTED,
                      ],
                    ],
                  },
                  1,
                  0,
                ],
              },
            },
            rejected: {
              $sum: {
                $cond: [
                  { $eq: ['$status', AiActionProposalStatus.REJECTED] },
                  1,
                  0,
                ],
              },
            },
            executed: {
              $sum: {
                $cond: [
                  { $eq: ['$status', AiActionProposalStatus.EXECUTED] },
                  1,
                  0,
                ],
              },
            },
            failed: {
              $sum: {
                $cond: [
                  { $eq: ['$status', AiActionProposalStatus.FAILED] },
                  1,
                  0,
                ],
              },
            },
          },
        },
        {
          $project: {
            _id: 0,
            agentId: '$_id',
            total: 1,
            approved: 1,
            rejected: 1,
            executed: 1,
            failed: 1,
          },
        },
      ])
      .exec();
  }

  async taskMetrics(
    organizationId: string,
    agentIds: string[],
    range: { from: Date; to: Date },
  ) {
    return this.tasks
      .aggregate<{
        agentId: string;
        created: number;
        completed: number;
      }>([
        {
          $match: {
            organizationId,
            'proposedByAgent.id': { $in: agentIds },
            createdAt: { $gte: range.from, $lt: range.to },
          },
        },
        {
          $group: {
            _id: '$proposedByAgent.id',
            created: { $sum: 1 },
            completed: {
              $sum: {
                $cond: [{ $eq: ['$status', TaskStatus.COMPLETED] }, 1, 0],
              },
            },
          },
        },
        { $project: { _id: 0, agentId: '$_id', created: 1, completed: 1 } },
      ])
      .exec();
  }
}
