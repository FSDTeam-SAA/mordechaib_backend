import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type RevenueSnapshotDocument = HydratedDocument<RevenueSnapshot>;

@Schema({ timestamps: true, collection: 'revenue_snapshots' })
export class RevenueSnapshot {
  // Truncated to midnight UTC — one document per calendar day, upserted
  // by the cron so re-running the same day never duplicates.
  @Prop({ required: true, unique: true, index: true })
  date!: Date;

  @Prop({ required: true, default: 0 })
  mrrUsd!: number;

  @Prop({ required: true, default: 0 })
  arrUsd!: number;

  @Prop({ required: true, default: 0 })
  activeSubscriptions!: number;

  // Count of ACTIVE/TRIALING subscriptions per plan type, keyed by
  // PlanType (e.g. { STARTER: 200, GROWTH: 52, ENTERPRISE: 208 }).
  @Prop({ type: Object, default: {} })
  planCounts!: Record<string, number>;
}

export const RevenueSnapshotSchema =
  SchemaFactory.createForClass(RevenueSnapshot);