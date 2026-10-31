import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  AiActionProposal,
  AiActionProposalStatus,
  AiActionType,
} from '../../database/schemas/ai-action-proposal.schema';
import { EmailDraft } from '../../database/schemas/email-draft.schema';

export type RoiActionSeriesRow = {
  date: string;
  actionType: AiActionType | 'EMAIL_DRAFT';
  count: number;
};

export type RoiTaskAgentRow = {
  agentId: string;
  agentName: string;
  agentType: string;
  count: number;
};

@Injectable()
export class RoiAnalyticsRepository {
  constructor(
    @InjectModel(AiActionProposal.name)
    private readonly proposals: Model<AiActionProposal>,
    @InjectModel(EmailDraft.name)
    private readonly emailDrafts: Model<EmailDraft>,
  ) {}

  async activity(
    organizationId: string,
    seriesRange: { from: Date; to: Date },
    agentRange: { from: Date; to: Date },
    timezone: string,
  ) {
    const [actions, emailDrafts, taskAgents] = await Promise.all([
      this.proposals
        .aggregate<RoiActionSeriesRow>([
          {
            $match: {
              organizationId,
              status: AiActionProposalStatus.EXECUTED,
              actionType: {
                $in: [
                  AiActionType.CREATE_TASK,
                  AiActionType.SCHEDULE_MEETING,
                  AiActionType.UPDATE_CRM_RECORD,
                ],
              },
              executedAt: { $gte: seriesRange.from, $lt: seriesRange.to },
            },
          },
          {
            $group: {
              _id: {
                date: {
                  $dateToString: {
                    date: '$executedAt',
                    format: '%Y-%m-%d',
                    timezone,
                  },
                },
                actionType: '$actionType',
              },
              count: { $sum: 1 },
            },
          },
          {
            $project: {
              _id: 0,
              date: '$_id.date',
              actionType: '$_id.actionType',
              count: 1,
            },
          },
          { $sort: { date: 1, actionType: 1 } },
        ])
        .exec(),
      this.emailDrafts
        .aggregate<RoiActionSeriesRow>([
          {
            $match: {
              organizationId,
              sourceAiResponseId: { $exists: true, $type: 'string' },
              createdAt: { $gte: seriesRange.from, $lt: seriesRange.to },
            },
          },
          {
            $group: {
              _id: {
                $dateToString: {
                  date: '$createdAt',
                  format: '%Y-%m-%d',
                  timezone,
                },
              },
              count: { $sum: 1 },
            },
          },
          {
            $project: {
              _id: 0,
              date: '$_id',
              actionType: { $literal: 'EMAIL_DRAFT' },
              count: 1,
            },
          },
          { $sort: { date: 1 } },
        ])
        .exec(),
      this.proposals
        .aggregate<RoiTaskAgentRow>([
          {
            $match: {
              organizationId,
              status: AiActionProposalStatus.EXECUTED,
              actionType: AiActionType.CREATE_TASK,
              executedAt: { $gte: agentRange.from, $lt: agentRange.to },
            },
          },
          {
            $group: {
              _id: {
                id: '$proposedByAgent.id',
                name: '$proposedByAgent.name',
                type: '$proposedByAgent.type',
              },
              count: { $sum: 1 },
            },
          },
          {
            $project: {
              _id: 0,
              agentId: '$_id.id',
              agentName: '$_id.name',
              agentType: '$_id.type',
              count: 1,
            },
          },
          { $sort: { count: -1, agentName: 1 } },
        ])
        .exec(),
    ]);
    return { series: [...actions, ...emailDrafts], taskAgents };
  }
}
