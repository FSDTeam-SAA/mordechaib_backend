import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { SubscriptionStatus } from '../../common/enums/subscription-status.enum';
import {
  RevenueAnalyticsAvailability,
  RevenueAnalyticsNormalizationSource,
} from '../../modules/revenue-analytics/revenue-analytics.enums';

export type RevenueOrganizationStateDocument =
  HydratedDocument<RevenueOrganizationState>;

@Schema({ timestamps: true, collection: 'revenue_organization_states' })
export class RevenueOrganizationState {
  @Prop({ required: true, unique: true, index: true })
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
    index: true,
  })
  availability!: RevenueAnalyticsAvailability;

  @Prop({
    required: true,
    enum: Object.values(RevenueAnalyticsNormalizationSource),
  })
  normalizationSource!: RevenueAnalyticsNormalizationSource;

  @Prop()
  subscriptionStartedAt?: Date;

  @Prop()
  currentPeriodStart?: Date;

  @Prop()
  currentPeriodEnd?: Date;

  @Prop({ required: true })
  sourceUpdatedAt!: Date;

  @Prop({ required: true })
  observedAt!: Date;

  @Prop({ required: true, trim: true })
  fingerprint!: string;
}

export const RevenueOrganizationStateSchema = SchemaFactory.createForClass(
  RevenueOrganizationState,
);
RevenueOrganizationStateSchema.index({ planId: 1, revenueActive: 1 });
RevenueOrganizationStateSchema.index({ status: 1, observedAt: -1 });
RevenueOrganizationStateSchema.index({ planId: 1, subscriptionStartedAt: 1 });
