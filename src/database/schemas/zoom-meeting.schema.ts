import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { ZoomMeetingStatus } from '../../common/enums/zoom-meeting-status.enum';

export type ZoomMeetingDocument = HydratedDocument<ZoomMeeting>;

@Schema({ timestamps: true, collection: 'zoom_meetings' })
export class ZoomMeeting {
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
    enum: Object.values(ZoomMeetingStatus),
    default: ZoomMeetingStatus.PENDING,
    index: true,
  })
  status!: ZoomMeetingStatus;

  @Prop()
  recallStatusCode?: string;

  @Prop()
  recallSubCode?: string;

  @Prop()
  failureMessage?: string;

  @Prop({ select: false })
  audioDownloadUrl?: string;

  @Prop()
  mediaExpiresAt?: Date;

  @Prop()
  transcriptionRequestedAt?: Date;

  @Prop()
  transcriptCompletedAt?: Date;

  @Prop({ type: Object, default: {} })
  metadata?: Record<string, unknown>;
}

export const ZoomMeetingSchema = SchemaFactory.createForClass(ZoomMeeting);
ZoomMeetingSchema.index({ organizationId: 1, createdAt: -1 });
ZoomMeetingSchema.index({ organizationId: 1, status: 1, joinAt: 1 });
ZoomMeetingSchema.index({ organizationId: 1, meetingUrlHash: 1, status: 1 });
