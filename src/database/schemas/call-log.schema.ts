import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type CallLogDocument = HydratedDocument<CallLog>;

@Schema({ timestamps: true, collection: 'call_logs' })
export class CallLog {
  @Prop({ required: true, index: true })
  organizationId!: string;

  @Prop({ required: true, unique: true, index: true })
  callSid!: string;

  @Prop({ required: true })
  fromNumber!: string;

  @Prop({ required: true })
  toNumber!: string;

  @Prop({ required: true, enum: ['INBOUND', 'OUTBOUND'] })
  direction!: string;

  @Prop({ required: true, default: 'INITIATED' })
  status!: string;

  @Prop()
  durationSec?: number;

  @Prop()
  recordingUrl?: string;

  @Prop()
  recordingSid?: string;
}

export const CallLogSchema = SchemaFactory.createForClass(CallLog);
CallLogSchema.index({ organizationId: 1, createdAt: -1 });
