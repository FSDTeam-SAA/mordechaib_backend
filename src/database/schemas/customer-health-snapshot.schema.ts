import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import {
  AiProposalSource,
  AiProposalSourceSchema,
} from './ai-action-proposal.schema';

export type CustomerHealthSnapshotDocument =
  HydratedDocument<CustomerHealthSnapshot>;

@Schema({ timestamps: true, collection: 'customer_health_snapshots' })
export class CustomerHealthSnapshot {
  @Prop({ required: true, index: true })
  organizationId!: string;

  @Prop({ required: true, index: true })
  contactId!: string;

  @Prop({ type: AiProposalSourceSchema, required: true })
  source!: AiProposalSource;

  @Prop({ required: true, min: 0, max: 100 })
  healthScore!: number;

  @Prop({ required: true, trim: true, uppercase: true, maxlength: 32 })
  riskLevel!: string;

  @Prop({ min: 0, max: 1 })
  analysisConfidence?: number;

  @Prop({ required: true, index: true })
  capturedAt!: Date;
}

export const CustomerHealthSnapshotSchema =
  SchemaFactory.createForClass(CustomerHealthSnapshot);
CustomerHealthSnapshotSchema.index(
  { organizationId: 1, contactId: 1, 'source.type': 1, 'source.id': 1 },
  { unique: true },
);
CustomerHealthSnapshotSchema.index({ organizationId: 1, capturedAt: -1 });
