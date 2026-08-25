import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type ZoomMeetingTranscriptDocument =
  HydratedDocument<ZoomMeetingTranscript>;

@Schema({ timestamps: true, collection: 'zoom_meeting_transcripts' })
export class ZoomMeetingTranscript {
  @Prop({ required: true, unique: true, index: true })
  meetingId!: string;

  @Prop({ required: true, index: true })
  organizationId!: string;

  @Prop({ required: true, index: true })
  recordingId!: string;

  @Prop({ required: true, unique: true, index: true })
  transcriptId!: string;

  @Prop({ required: true, default: 'recallai_async' })
  provider!: string;

  @Prop({ default: 'auto' })
  languageCode?: string;

  @Prop({ required: true })
  transcriptText!: string;

  @Prop({ type: [Object], default: [] })
  segments!: Record<string, unknown>[];

  @Prop({ required: true, default: 0 })
  wordCount!: number;
}

export const ZoomMeetingTranscriptSchema = SchemaFactory.createForClass(
  ZoomMeetingTranscript,
);
ZoomMeetingTranscriptSchema.index({ organizationId: 1, createdAt: -1 });
