import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import {
  RevenueAnalyticsAvailability,
  RevenueCostPricingSource,
  RevenueServiceProvider,
  RevenueUsageUnit,
} from '../../modules/revenue-analytics/revenue-analytics.enums';

export type RevenueServiceCostDocument = HydratedDocument<RevenueServiceCost>;

@Schema({ timestamps: true, collection: 'revenue_service_costs' })
export class RevenueServiceCost {
  @Prop({ required: true, unique: true, index: true })
  dedupeKey!: string;

  @Prop({ required: true, index: true })
  organizationId!: string;

  @Prop({
    required: true,
    enum: Object.values(RevenueServiceProvider),
    index: true,
  })
  provider!: RevenueServiceProvider;

  @Prop({ required: true, trim: true, maxlength: 80 })
  sourceType!: string;

  @Prop({ required: true, trim: true, maxlength: 200, index: true })
  sourceId!: string;

  @Prop({ required: true, min: 0 })
  quantity!: number;

  @Prop({ required: true, enum: Object.values(RevenueUsageUnit) })
  unit!: RevenueUsageUnit;

  @Prop({ min: 0 })
  inputTokens?: number;

  @Prop({ min: 0 })
  outputTokens?: number;

  @Prop({ trim: true, maxlength: 200 })
  model?: string;

  @Prop({ min: 0 })
  costUsd?: number;

  @Prop({ min: 0 })
  fallbackRateUsd?: number;

  @Prop({ required: true, default: false })
  isEstimated!: boolean;

  @Prop({ required: true, enum: Object.values(RevenueCostPricingSource) })
  pricingSource!: RevenueCostPricingSource;

  @Prop({ required: true, enum: Object.values(RevenueAnalyticsAvailability) })
  availability!: RevenueAnalyticsAvailability;

  @Prop({ required: true, index: true })
  occurredAt!: Date;
}

export const RevenueServiceCostSchema =
  SchemaFactory.createForClass(RevenueServiceCost);
RevenueServiceCostSchema.index({ occurredAt: 1, provider: 1 });
RevenueServiceCostSchema.index({ organizationId: 1, occurredAt: 1 });
RevenueServiceCostSchema.index({ provider: 1, occurredAt: 1, availability: 1 });
