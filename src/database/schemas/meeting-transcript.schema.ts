import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { MeetingPlatform } from '../../common/enums/meeting-platform.enum';

export type MeetingTranscriptDocument = HydratedDocument<MeetingTranscript>;

@Schema({ timestamps: true, collection: 'meeting_transcripts' })
export class MeetingTranscript {
  @Prop({ required: true, unique: true, index: true })
  meetingId!: string;

  @Prop({ required: true, enum: Object.values(MeetingPlatform), index: true })
  platform!: MeetingPlatform;

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

export const MeetingTranscriptSchema =
  SchemaFactory.createForClass(MeetingTranscript);
MeetingTranscriptSchema.index({
  organizationId: 1,
  platform: 1,
  createdAt: -1,
});
