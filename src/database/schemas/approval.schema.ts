import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { IntegrationProvider } from './integration.schema';

export type ApprovalDocument = HydratedDocument<Approval>;

export enum ApprovalStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  EXECUTED = 'EXECUTED',
  FAILED = 'FAILED',
}

@Schema({ timestamps: true, collection: 'approvals' })
export class Approval {
  @Prop({ required: true, index: true })
  organizationId!: string;

  @Prop({ required: true })
  actionType!: string;

  @Prop({ enum: Object.values(IntegrationProvider) })
  provider?: IntegrationProvider;

  @Prop({ type: Object, required: true })
  payload!: Record<string, unknown>;

  @Prop({
    default: ApprovalStatus.PENDING,
    enum: Object.values(ApprovalStatus),
    index: true,
  })
  status!: ApprovalStatus;
}

export const ApprovalSchema = SchemaFactory.createForClass(Approval);
ApprovalSchema.index({ organizationId: 1, status: 1, createdAt: -1 });
