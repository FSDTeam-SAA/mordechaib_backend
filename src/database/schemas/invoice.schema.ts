import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { InvoiceStatus } from '../../common/enums/invoice-status.enum';
import { PlanType } from '../../common/enums/plan-type.enum';

export type InvoiceDocument = HydratedDocument<Invoice>;

@Schema({ timestamps: true, collection: 'invoices' })
export class Invoice {
  @Prop({ required: true, unique: true, index: true })
  stripeInvoiceId!: string;

  @Prop()
  stripeSubscriptionId?: string;

  // Stripe's own human-readable invoice number (e.g. "INV-2847"), not our
  // Mongo _id — this is what the admin table's "Invoice ID" column shows.
  @Prop()
  invoiceNumber?: string;

  @Prop({ required: true, index: true })
  organizationId!: string;

  // Snapshot, not a live join — an invoice should keep showing the org
  // name as it was at billing time even if the org renames itself later.
  @Prop({ required: true })
  organizationName!: string;

  @Prop()
  planId?: string;

  @Prop({ enum: Object.values(PlanType) })
  planType?: PlanType;

  @Prop()
  planName?: string;

  @Prop({ required: true, default: 0 })
  amountUsd!: number;

  // 'month' | 'year', snapshotted from the subscription at invoice time.
  @Prop()
  billingInterval?: string;

  @Prop({
    required: true,
    enum: Object.values(InvoiceStatus),
    index: true,
  })
  status!: InvoiceStatus;

  @Prop()
  hostedInvoiceUrl?: string;

  @Prop()
  invoicePdfUrl?: string;

  @Prop()
  periodStart?: Date;

  @Prop()
  periodEnd?: Date;

  @Prop({ required: true, index: true })
  issuedAt!: Date;
}

export const InvoiceSchema = SchemaFactory.createForClass(Invoice);