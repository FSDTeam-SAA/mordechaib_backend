import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { CallTranscriptSegment } from './call-log.schema';

export type CallRecordingDocument = HydratedDocument<CallRecording>;

@Schema({ timestamps: true, collection: 'call_recordings' })
export class CallRecording {
  @Prop({ required: true, index: true })
  organizationId!: string;

  @Prop({ required: true, index: true })
  callSid!: string;

  @Prop({ index: true })
  providerCallSid?: string;

  @Prop({ required: true, unique: true, index: true })
  recordingSid!: string;

  @Prop({ required: true })
  recordingUrl!: string;

  @Prop({ required: true })
  recordingStatus!: string;

  @Prop()
  recordingDuration?: number;

  @Prop()
  recordingChannels?: number;

  @Prop({
    required: true,
    default: 'PENDING',
    enum: ['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED'],
    index: true,
  })
  aiStatus!: string;

  @Prop()
  localFilePath?: string;

  @Prop()
  storageProvider?: string;

  @Prop()
  storageKey?: string;

  @Prop()
  storageAssetId?: string;

  @Prop()
  storageResourceType?: string;

  @Prop()
  storageDeliveryType?: string;

  @Prop()
  storageFormat?: string;

  @Prop()
  transcriptText?: string;

  @Prop({ type: [Object], default: [] })
  transcriptSegments!: CallTranscriptSegment[];

  @Prop({ index: true })
  transcriptionSid?: string;

  @Prop()
  transcriptionProvider?: string;

  @Prop({ enum: ['COMPLETED', 'FAILED'] })
  transcriptionStatus?: string;

  @Prop()
  transcriptionCompletedAt?: Date;

  @Prop()
  transcriptionError?: string;

  @Prop()
  summary?: string;
}

export const CallRecordingSchema = SchemaFactory.createForClass(CallRecording);
CallRecordingSchema.index({ organizationId: 1, createdAt: -1 });
CallRecordingSchema.index({ organizationId: 1, callSid: 1 });
