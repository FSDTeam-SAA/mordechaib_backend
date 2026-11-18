import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { SubscriptionStatus } from '../../common/enums/subscription-status.enum';
import {
  RevenueAnalyticsAvailability,
  RevenueAnalyticsNormalizationSource,
} from '../../modules/revenue-analytics/revenue-analytics.enums';

export type RevenueDailySnapshotDocument =
  HydratedDocument<RevenueDailySnapshot>;

@Schema({ timestamps: true, collection: 'revenue_daily_snapshots' })
export class RevenueDailySnapshot {
  @Prop({ required: true, index: true })
  snapshotDate!: Date;

  @Prop({ required: true, index: true })
  organizationId!: string;

  @Prop({ required: true, index: true })
  subscriptionId!: string;

  @Prop({ required: true, index: true })
  planId!: string;

  @Prop({
    required: true,
    enum: Object.values(SubscriptionStatus),
    index: true,
  })
  status!: SubscriptionStatus;

  @Prop({ enum: ['month', 'year'] })
  billingInterval?: 'month' | 'year';

  @Prop({ required: true, min: 0, default: 0 })
  normalizedMrrUsd!: number;

  @Prop({ required: true, default: false, index: true })
  revenueActive!: boolean;

  @Prop({ required: true, default: false })
  paused!: boolean;

  @Prop({ required: true, default: false })
  isEstimated!: boolean;

  @Prop({
    required: true,
    enum: Object.values(RevenueAnalyticsAvailability),
  })
  availability!: RevenueAnalyticsAvailability;

  @Prop({
    required: true,
    enum: Object.values(RevenueAnalyticsNormalizationSource),
  })
  normalizationSource!: RevenueAnalyticsNormalizationSource;

  @Prop()
  subscriptionStartedAt?: Date;

  @Prop({ required: true })
  sourceUpdatedAt!: Date;

  @Prop({ required: true })
  observedAt!: Date;
}

export const RevenueDailySnapshotSchema =
  SchemaFactory.createForClass(RevenueDailySnapshot);
RevenueDailySnapshotSchema.index(
  { snapshotDate: 1, organizationId: 1 },
  { unique: true },
);
RevenueDailySnapshotSchema.index({ snapshotDate: 1, planId: 1 });
RevenueDailySnapshotSchema.index({ snapshotDate: 1, revenueActive: 1 });
RevenueDailySnapshotSchema.index({ observedAt: -1 });
RevenueDailySnapshotSchema.index({ planId: 1, observedAt: -1 });
