import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { MeetingBotStatus } from '../../common/enums/meeting-bot-status.enum';
import { MeetingPlatform } from '../../common/enums/meeting-platform.enum';

export type MeetingBotDocument = HydratedDocument<MeetingBot>;

@Schema({ timestamps: true, collection: 'meeting_bots' })
export class MeetingBot {
  @Prop({ required: true, enum: Object.values(MeetingPlatform), index: true })
  platform!: MeetingPlatform;

  @Prop({ required: true, index: true })
  organizationId!: string;

  @Prop({ required: true, index: true })
  createdByUserId!: string;

  @Prop({ required: true, unique: true, index: true, select: false })
  deduplicationKey!: string;

  @Prop({ unique: true, sparse: true, select: false })
  activeMeetingKey?: string;

  @Prop({ required: true, index: true, select: false })
  meetingUrlHash!: string;

  @Prop({ required: true, select: false })
  meetingUrlEncrypted!: string;

  @Prop({ index: true, sparse: true })
  recallBotId?: string;

  @Prop({ index: true, sparse: true })
  recordingId?: string;

  @Prop({ index: true, sparse: true })
  transcriptId?: string;

  @Prop({ index: true })
  joinAt?: Date;

  @Prop({ required: true })
  botName!: string;

  @Prop({
    required: true,
    enum: Object.values(MeetingBotStatus),
    default: MeetingBotStatus.PENDING,
    index: true,
  })
  status!: MeetingBotStatus;

  @Prop()
  recallStatusCode?: string;

  @Prop()
  recallSubCode?: string;

  @Prop()
  failureCode?: string;

  @Prop()
  failureMessage?: string;

  @Prop({ required: true, default: 'RECALL' })
  audioStorageProvider!: string;

  @Prop({ select: false })
  audioStorageReference?: string;

  @Prop()
  mediaExpiresAt?: Date;

  @Prop()
  transcriptionRequestedAt?: Date;

  @Prop()
  transcriptCompletedAt?: Date;

  @Prop({ type: Object, default: {} })
  metadata?: Record<string, unknown>;
}

export const MeetingBotSchema = SchemaFactory.createForClass(MeetingBot);
MeetingBotSchema.index({ organizationId: 1, platform: 1, createdAt: -1 });
MeetingBotSchema.index({
  organizationId: 1,
  platform: 1,
  status: 1,
  joinAt: 1,
});
MeetingBotSchema.index({ organizationId: 1, meetingUrlHash: 1, status: 1 });
