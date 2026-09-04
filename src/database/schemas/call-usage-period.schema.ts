import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type CallUsagePeriodDocument = HydratedDocument<CallUsagePeriod>;

@Schema({ timestamps: true, collection: 'call_usage_periods' })
export class CallUsagePeriod {
  @Prop({ required: true, index: true })
  organizationId!: string;

  @Prop({ required: true })
  periodStart!: Date;

  @Prop({ required: true })
  periodEnd!: Date;

  @Prop({ required: true, default: 0, min: 0 })
  totalSeconds!: number;

  @Prop()
  includedUsageAlertSentAt?: Date;

  @Prop()
  unusualUsageAlertSentAt?: Date;

  @Prop()
  spendingAlertSentAt?: Date;
}

export const CallUsagePeriodSchema =
  SchemaFactory.createForClass(CallUsagePeriod);
CallUsagePeriodSchema.index(
  { organizationId: 1, periodStart: 1, periodEnd: 1 },
  { unique: true },
);
