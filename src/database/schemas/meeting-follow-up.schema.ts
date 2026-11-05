import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { MeetingFollowUpStatus } from '../../common/enums/meeting-follow-up-status.enum';
import {
  AiProposalSource,
  AiProposalSourceSchema,
} from './ai-action-proposal.schema';

export type MeetingFollowUpDocument = HydratedDocument<MeetingFollowUp>;

@Schema({ timestamps: true, collection: 'meeting_follow_ups' })
export class MeetingFollowUp {
  @Prop({ required: true, index: true })
  organizationId!: string;

  @Prop({ type: AiProposalSourceSchema, required: true })
  source!: AiProposalSource;

  @Prop({ required: true, min: 0, max: 100 })
  detectionScore!: number;

  @Prop({ min: 0, max: 1 })
  analysisConfidence?: number;

  @Prop({ required: true, enum: Object.values(MeetingFollowUpStatus), index: true })
  status!: MeetingFollowUpStatus;

  @Prop({ required: true })
  detectedAt!: Date;

  @Prop()
  resolvedAt?: Date;

  @Prop()
  resolvedByUserId?: string;
}

export const MeetingFollowUpSchema = SchemaFactory.createForClass(MeetingFollowUp);
MeetingFollowUpSchema.index(
  { organizationId: 1, 'source.type': 1, 'source.id': 1 },
  { unique: true },
);
MeetingFollowUpSchema.index({ organizationId: 1, status: 1, detectedAt: -1 });
