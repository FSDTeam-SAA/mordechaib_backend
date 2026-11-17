import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type UsageBillingPeriodDocument = HydratedDocument<UsageBillingPeriod>;

@Schema({ timestamps: true, collection: 'usage_billing_periods' })
export class UsageBillingPeriod {
  @Prop({ required: true, index: true })
  organizationId!: string;

  @Prop({ required: true, index: true })
  metric!: string;

  @Prop({ required: true })
  unit!: string;

  @Prop({ required: true, index: true })
  periodStart!: Date;

  @Prop({ required: true, index: true })
  periodEnd!: Date;

  @Prop({ required: true, default: 0 })
  measuredQuantity!: number;

  @Prop({ required: true, default: 0 })
  includedQuantity!: number;

  @Prop({ required: true, default: 0 })
  billableQuantity!: number;

  @Prop({ required: true, default: 0 })
  rateUsd!: number;

  @Prop({ required: true, default: 0 })
  amountUsd!: number;

  @Prop({ required: true, default: 0 })
  billedAmountUsd!: number;

  @Prop({ type: [String], default: [] })
  stripeInvoiceItemIds!: string[];

  @Prop({
    enum: ['NOT_REQUIRED', 'PENDING', 'BILLED', 'FAILED'],
    default: 'NOT_REQUIRED',
  })
  status!: 'NOT_REQUIRED' | 'PENDING' | 'BILLED' | 'FAILED';

  @Prop()
  stripeInvoiceId?: string;

  @Prop()
  billingError?: string;

  @Prop()
  reconciledAt?: Date;
}

export const UsageBillingPeriodSchema =
  SchemaFactory.createForClass(UsageBillingPeriod);

UsageBillingPeriodSchema.index(
  { organizationId: 1, metric: 1, periodStart: 1, periodEnd: 1 },
  { unique: true },
);
