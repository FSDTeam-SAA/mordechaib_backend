import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AgentActivityStatus } from '../../common/enums/agent-activity.enum';
import { PlatformMeetingStatus } from '../../common/enums/platform-meeting-status.enum';
import { AgentActivity } from '../../database/schemas/agent-activity.schema';
import { Invoice } from '../../database/schemas/invoice.schema';
import { PlatformMeeting } from '../../database/schemas/platform-meeting.schema';
import { RevenueCostCursor } from '../../database/schemas/revenue-cost-cursor.schema';
import { RevenueServiceCost } from '../../database/schemas/revenue-service-cost.schema';
import { UsageRecord } from '../../database/schemas/usage-record.schema';
import { InvoiceStatus } from '../../common/enums/invoice-status.enum';
import {
  RevenueAnalyticsAvailability,
  RevenueCostPricingSource,
  RevenueServiceProvider,
  RevenueUsageUnit,
} from './revenue-analytics.enums';
import {
  RevenueCostAggregateRecord,
  RevenueCostCursorRecord,
  RevenueCostSourceRecord,
  RevenueCostTrendRecord,
  RevenuePaidRevenueTrendRecord,
  RevenueServiceCostRecord,
} from './revenue-cost.types';

type Timestamped = { _id: Types.ObjectId; createdAt: Date; updatedAt: Date };

@Injectable()
export class RevenueCostRepository {
  constructor(
    @InjectModel(AgentActivity.name)
    private readonly activities: Model<AgentActivity>,
    @InjectModel(UsageRecord.name)
    private readonly usage: Model<UsageRecord>,
    @InjectModel(PlatformMeeting.name)
    private readonly meetings: Model<PlatformMeeting>,
    @InjectModel(Invoice.name)
    private readonly invoices: Model<Invoice>,
    @InjectModel(RevenueServiceCost.name)
    private readonly costs: Model<RevenueServiceCost>,
    @InjectModel(RevenueCostCursor.name)
    private readonly cursors: Model<RevenueCostCursor>,
  ) {}

  async cursor(provider: RevenueServiceProvider) {
    const document = await this.cursors.findOne({ provider }).lean().exec();
    return document
      ? {
          lastUpdatedAt: document.lastUpdatedAt,
          lastSourceObjectId: document.lastSourceObjectId,
        }
      : undefined;
  }

  listAiSources(cursor: RevenueCostCursorRecord | undefined, limit: number) {
    return this.activities
      .find({
        status: AgentActivityStatus.SUCCEEDED,
        ...this.cursorFilter(cursor),
      })
      .sort({ updatedAt: 1, _id: 1 })
      .limit(limit)
      .lean<Array<AgentActivity & Timestamped>>()
      .exec()
      .then((rows) =>
        rows.map<RevenueCostSourceRecord>((row) => {
          const usage = this.aiUsage(row.metadata);
          return {
            id: String(row._id),
            organizationId: row.organizationId,
            updatedAt: row.updatedAt,
            occurredAt: row.completedAt ?? row.startedAt,
            quantity: usage.totalTokens ?? 1,
            unit:
              usage.totalTokens === undefined
                ? RevenueUsageUnit.OPERATION
                : RevenueUsageUnit.TOKEN,
            sourceType: row.operationType,
            inputTokens: usage.inputTokens,
            outputTokens: usage.outputTokens,
            model: usage.model,
            providerCostUsd: usage.costUsd,
          };
        }),
      );
  }

  listTwilioSources(
    cursor: RevenueCostCursorRecord | undefined,
    limit: number,
  ) {
    return this.usage
      .find({
        provider: 'TWILIO',
        metric: 'CALL_SECONDS',
        ...this.cursorFilter(cursor),
      })
      .sort({ updatedAt: 1, _id: 1 })
      .limit(limit)
      .lean<Array<UsageRecord & Timestamped>>()
      .exec()
      .then((rows) =>
        rows.map<RevenueCostSourceRecord>((row) => ({
          id: String(row._id),
          organizationId: row.organizationId,
          updatedAt: row.updatedAt,
          occurredAt: row.createdAt,
          quantity: row.quantity,
          unit: RevenueUsageUnit.SECOND,
          sourceType: row.metric,
        })),
      );
  }

  listRecallSources(
    cursor: RevenueCostCursorRecord | undefined,
    limit: number,
  ) {
    return this.meetings
      .find({
        status: PlatformMeetingStatus.COMPLETED,
        botRequested: true,
        meetingBotId: { $type: 'string' },
        ...this.cursorFilter(cursor),
      })
      .sort({ updatedAt: 1, _id: 1 })
      .limit(limit)
      .lean<Array<PlatformMeeting & Timestamped>>()
      .exec()
      .then((rows) =>
        rows.map<RevenueCostSourceRecord>((row) => ({
          id: String(row._id),
          organizationId: row.organizationId,
          updatedAt: row.updatedAt,
          occurredAt: row.startsAt,
          quantity: row.durationMinutes,
          unit: RevenueUsageUnit.MINUTE,
          sourceType: 'MEETING_CAPTURE',
        })),
      );
  }

  async persistBatch(
    provider: RevenueServiceProvider,
    events: RevenueServiceCostRecord[],
    cursor: RevenueCostCursorRecord,
  ) {
    if (events.length > 0) {
      await this.costs.bulkWrite(
        events.map((event) => ({
          updateOne: {
            filter: { dedupeKey: event.dedupeKey },
            update: { $set: event },
            upsert: true,
          },
        })),
        { ordered: false },
      );
    }
    await this.cursors
      .findOneAndUpdate(
        { provider },
        { $set: { provider, ...cursor } },
        { upsert: true, new: true },
      )
      .exec();
  }

  /**
   * Reprices only fallback-managed rows. Provider-reported AI cost remains
   * authoritative and is never overwritten.
   */
  repriceFallbackCosts(
    provider: RevenueServiceProvider,
    fallbackRate: number | undefined,
  ) {
    const baseFilter = {
      provider,
      pricingSource: {
        $in: [
          RevenueCostPricingSource.CONFIGURED_FALLBACK,
          RevenueCostPricingSource.UNAVAILABLE,
        ],
      },
    };
    if (fallbackRate === undefined) {
      return this.costs
        .updateMany(
          {
            ...baseFilter,
            pricingSource: RevenueCostPricingSource.CONFIGURED_FALLBACK,
          },
          {
            $unset: { costUsd: 1, fallbackRateUsd: 1 },
            $set: {
              isEstimated: false,
              pricingSource: RevenueCostPricingSource.UNAVAILABLE,
              availability: RevenueAnalyticsAvailability.UNAVAILABLE,
            },
          },
        )
        .exec();
    }

    const costExpression =
      provider === RevenueServiceProvider.AI
        ? fallbackRate
        : provider === RevenueServiceProvider.TWILIO
          ? { $multiply: [{ $divide: ['$quantity', 60] }, fallbackRate] }
          : { $multiply: ['$quantity', fallbackRate] };
    return this.costs
      .updateMany(
        {
          ...baseFilter,
          $or: [
            { pricingSource: RevenueCostPricingSource.UNAVAILABLE },
            { fallbackRateUsd: { $ne: fallbackRate } },
          ],
        },
        [
          {
            $set: {
              costUsd: { $round: [costExpression, 6] },
              fallbackRateUsd: fallbackRate,
              isEstimated: true,
              pricingSource: RevenueCostPricingSource.CONFIGURED_FALLBACK,
              availability: RevenueAnalyticsAvailability.AVAILABLE,
            },
          },
        ],
      )
      .exec();
  }

  async aggregateCosts(from: Date, to: Date) {
    return this.costs.aggregate<RevenueCostAggregateRecord>([
      { $match: { occurredAt: { $gte: from, $lt: to } } },
      {
        $group: {
          _id: '$provider',
          eventCount: { $sum: 1 },
          quantity: { $sum: '$quantity' },
          costUsd: { $sum: { $ifNull: ['$costUsd', 0] } },
          costAvailableEvents: {
            $sum: {
              $cond: [{ $ne: [{ $type: '$costUsd' }, 'missing'] }, 1, 0],
            },
          },
          estimatedEvents: { $sum: { $cond: ['$isEstimated', 1, 0] } },
        },
      },
      {
        $project: {
          _id: 0,
          provider: '$_id',
          eventCount: 1,
          quantity: 1,
          costUsd: 1,
          costAvailableEvents: 1,
          estimatedEvents: 1,
        },
      },
    ]);
  }

  aggregateCostTrend(from: Date, to: Date, timezone: string) {
    return this.costs.aggregate<RevenueCostTrendRecord>([
      { $match: { occurredAt: { $gte: from, $lt: to } } },
      {
        $group: {
          _id: {
            period: {
              $dateToString: {
                date: '$occurredAt',
                format: '%Y-%m',
                timezone,
              },
            },
            provider: '$provider',
          },
          eventCount: { $sum: 1 },
          quantity: { $sum: '$quantity' },
          costUsd: { $sum: { $ifNull: ['$costUsd', 0] } },
          costAvailableEvents: {
            $sum: {
              $cond: [{ $ne: [{ $type: '$costUsd' }, 'missing'] }, 1, 0],
            },
          },
          estimatedEvents: { $sum: { $cond: ['$isEstimated', 1, 0] } },
        },
      },
      {
        $project: {
          _id: 0,
          period: '$_id.period',
          provider: '$_id.provider',
          eventCount: 1,
          quantity: 1,
          costUsd: 1,
          costAvailableEvents: 1,
          estimatedEvents: 1,
        },
      },
      { $sort: { period: 1, provider: 1 } },
    ]);
  }

  async paidRevenue(from: Date, to: Date) {
    const [row] = await this.invoices.aggregate<{ revenueUsd: number }>([
      {
        $match: {
          status: InvoiceStatus.PAID,
          issuedAt: { $gte: from, $lt: to },
        },
      },
      { $group: { _id: null, revenueUsd: { $sum: '$amountUsd' } } },
    ]);
    return row?.revenueUsd ?? 0;
  }

  paidRevenueTrend(from: Date, to: Date, timezone: string) {
    return this.invoices.aggregate<RevenuePaidRevenueTrendRecord>([
      {
        $match: {
          status: InvoiceStatus.PAID,
          issuedAt: { $gte: from, $lt: to },
        },
      },
      {
        $group: {
          _id: {
            $dateToString: {
              date: '$issuedAt',
              format: '%Y-%m',
              timezone,
            },
          },
          revenueUsd: { $sum: '$amountUsd' },
        },
      },
      {
        $project: {
          _id: 0,
          period: '$_id',
          revenueUsd: 1,
        },
      },
      { $sort: { period: 1 } },
    ]);
  }

  private cursorFilter(cursor?: RevenueCostCursorRecord) {
    if (!cursor) return {};
    return {
      $or: [
        { updatedAt: { $gt: cursor.lastUpdatedAt } },
        {
          updatedAt: cursor.lastUpdatedAt,
          _id: { $gt: new Types.ObjectId(cursor.lastSourceObjectId) },
        },
      ],
    };
  }

  private aiUsage(metadata: Record<string, unknown> | undefined) {
    const raw = metadata?.aiUsage;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
    const usage = raw as Record<string, unknown>;
    return {
      inputTokens: this.nonNegativeInteger(usage.inputTokens),
      outputTokens: this.nonNegativeInteger(usage.outputTokens),
      totalTokens: this.nonNegativeInteger(usage.totalTokens),
      costUsd: this.nonNegativeNumber(usage.costUsd),
      model: typeof usage.model === 'string' ? usage.model : undefined,
    };
  }

  private nonNegativeInteger(value: unknown) {
    return typeof value === 'number' && Number.isInteger(value) && value >= 0
      ? value
      : undefined;
  }

  private nonNegativeNumber(value: unknown) {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0
      ? value
      : undefined;
  }
}
