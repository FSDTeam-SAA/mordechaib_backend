import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { RevenueServiceProvider } from '../../modules/revenue-analytics/revenue-analytics.enums';

export type RevenueCostCursorDocument = HydratedDocument<RevenueCostCursor>;

@Schema({ timestamps: true, collection: 'revenue_cost_cursors' })
export class RevenueCostCursor {
  @Prop({
    required: true,
    unique: true,
    enum: Object.values(RevenueServiceProvider),
  })
  provider!: RevenueServiceProvider;

  @Prop({ required: true })
  lastUpdatedAt!: Date;

  @Prop({ required: true })
  lastSourceObjectId!: string;
}

export const RevenueCostCursorSchema =
  SchemaFactory.createForClass(RevenueCostCursor);
