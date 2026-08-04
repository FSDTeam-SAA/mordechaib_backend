import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { OrganizationSubscription } from '../../database/schemas/organization-subscription.schema';
import { RevenueSnapshot } from '../../database/schemas/revenue-snapshot.schema';
import { SubscriptionStatus } from '../../common/enums/subscription-status.enum';

const LIVE_STATUSES = [
  SubscriptionStatus.ACTIVE,
  SubscriptionStatus.TRIALING,
];

@Injectable()
export class SubscriptionAnalyticsRepository {
  constructor(
    @InjectModel(OrganizationSubscription.name)
    private readonly subscriptionModel: Model<OrganizationSubscription>,
    @InjectModel(RevenueSnapshot.name)
    private readonly snapshotModel: Model<RevenueSnapshot>,
  ) {}

  // Live totals — always accurate for "right now", unlike historical
  // months which depend on snapshots (see below).
  async getLiveTotals() {
    const [result] = await this.subscriptionModel.aggregate<{
      activeSubscriptions: number;
      mrrUsd: number;
    }>([
      { $match: { status: { $in: LIVE_STATUSES } } },
      {
        $group: {
          _id: null,
          activeSubscriptions: { $sum: 1 },
          mrrUsd: { $sum: { $ifNull: ['$snapshotLimits.priceUsd', 0] } },
        },
      },
    ]);
    return result ?? { activeSubscriptions: 0, mrrUsd: 0 };
  }

  // Counts + MRR grouped by planId (application layer resolves
  // planId -> planType/name, since that only requires one small lookup
  // against the plan catalog rather than a Mongo $lookup here).
  async getLiveTotalsByPlan() {
    return this.subscriptionModel.aggregate<{
      _id: string;
      count: number;
      mrrUsd: number;
    }>([
      { $match: { status: { $in: LIVE_STATUSES } } },
      {
        $group: {
          _id: '$planId',
          count: { $sum: 1 },
          mrrUsd: { $sum: { $ifNull: ['$snapshotLimits.priceUsd', 0] } },
        },
      },
    ]);
  }

  countRenewalsSince(since: Date) {
    return this.subscriptionModel
      .countDocuments({
        status: { $in: LIVE_STATUSES },
        currentPeriodStart: { $gte: since },
      })
      .exec();
  }

  // --- Snapshot read/write, used for trend + vs-last-month/year deltas ---

  upsertSnapshotForDate(
    date: Date,
    data: {
      mrrUsd: number;
      arrUsd: number;
      activeSubscriptions: number;
      planCounts: Record<string, number>;
    },
  ) {
    return this.snapshotModel
      .findOneAndUpdate({ date }, { $set: data }, { new: true, upsert: true })
      .exec();
  }

  findSnapshotsBetween(start: Date, end: Date) {
    return this.snapshotModel
      .find({ date: { $gte: start, $lte: end } })
      .sort({ date: 1 })
      .exec();
  }

  // Nearest snapshot at or before `date` — used to find "last month" /
  // "last year" baselines without requiring an exact-day match.
  findNearestSnapshotBefore(date: Date) {
    return this.snapshotModel
      .findOne({ date: { $lte: date } })
      .sort({ date: -1 })
      .exec();
  }
}