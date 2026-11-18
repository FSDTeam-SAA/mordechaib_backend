import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { SubscriptionStatus } from '../../common/enums/subscription-status.enum';
import {
  RevenueAnalyticsMovementType,
  RevenueAnalyticsNormalizationSource,
} from '../../modules/revenue-analytics/revenue-analytics.enums';

export type RevenueMovementDocument = HydratedDocument<RevenueMovement>;

@Schema({ timestamps: true, collection: 'revenue_movements' })
export class RevenueMovement {
  @Prop({ required: true, unique: true, index: true })
  dedupeKey!: string;

  @Prop({ required: true, index: true })
  organizationId!: string;

  @Prop({ required: true, index: true })
  subscriptionId!: string;

  @Prop({
    required: true,
    enum: Object.values(RevenueAnalyticsMovementType),
    index: true,
  })
  type!: RevenueAnalyticsMovementType;

  @Prop({ index: true })
  previousPlanId?: string;

  @Prop({ index: true })
  nextPlanId?: string;

  @Prop({ enum: Object.values(SubscriptionStatus) })
  previousStatus?: SubscriptionStatus;

  @Prop({ enum: Object.values(SubscriptionStatus) })
  nextStatus?: SubscriptionStatus;

  @Prop({ required: true, min: 0, default: 0 })
  previousMrrUsd!: number;

  @Prop({ required: true, min: 0, default: 0 })
  nextMrrUsd!: number;

  @Prop({ required: true, default: 0 })
  deltaMrrUsd!: number;

  @Prop({ required: true, default: false })
  isEstimated!: boolean;

  @Prop({
    required: true,
    enum: Object.values(RevenueAnalyticsNormalizationSource),
  })
  normalizationSource!: RevenueAnalyticsNormalizationSource;

  @Prop({ required: true, index: true })
  effectiveAt!: Date;

  @Prop({ required: true })
  observedAt!: Date;
}

export const RevenueMovementSchema =
  SchemaFactory.createForClass(RevenueMovement);
RevenueMovementSchema.index({ effectiveAt: 1, type: 1 });
RevenueMovementSchema.index({ organizationId: 1, effectiveAt: 1 });
RevenueMovementSchema.index({ nextPlanId: 1, effectiveAt: 1 });
