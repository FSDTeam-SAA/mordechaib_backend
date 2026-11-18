import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { RevenueAcquisitionChannel } from '../../modules/revenue-analytics/revenue-analytics.enums';

export type RevenueAcquisitionCostDocument =
  HydratedDocument<RevenueAcquisitionCost>;

@Schema({ timestamps: true, collection: 'revenue_acquisition_costs' })
export class RevenueAcquisitionCost {
  @Prop({ required: true, match: /^\d{4}-(0[1-9]|1[0-2])$/, index: true })
  period!: string;

  @Prop({
    required: true,
    enum: Object.values(RevenueAcquisitionChannel),
    index: true,
  })
  channel!: RevenueAcquisitionChannel;

  @Prop({ required: true, min: 0, default: 0 })
  salesCostUsd!: number;

  @Prop({ required: true, min: 0, default: 0 })
  marketingCostUsd!: number;

  @Prop({ required: true, enum: ['USD'], default: 'USD' })
  currency!: 'USD';

  @Prop({ trim: true, maxlength: 500 })
  notes?: string;

  @Prop({ required: true, index: true })
  createdByUserId!: string;

  @Prop({ required: true })
  updatedByUserId!: string;
}

export const RevenueAcquisitionCostSchema = SchemaFactory.createForClass(
  RevenueAcquisitionCost,
);
RevenueAcquisitionCostSchema.index({ period: 1, channel: 1 }, { unique: true });
