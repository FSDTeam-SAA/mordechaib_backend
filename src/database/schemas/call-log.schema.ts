import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type CallLogDocument = HydratedDocument<CallLog>;

@Schema({ timestamps: true, collection: 'call_logs' })
export class CallLog {
  @Prop({ required: true, index: true })
  organizationId!: string;

  @Prop({ required: true, unique: true, index: true })
  callSid!: string;

  @Prop({ index: true })
  parentCallSid?: string;

  @Prop({ index: true })
  dialCallSid?: string;

  @Prop()
  accountSid?: string;

  @Prop({ required: true })
  fromNumber!: string;

  @Prop({ required: true })
  toNumber!: string;

  @Prop()
  twilioNumber?: string;

  @Prop()
  forwardingNumber?: string;

  @Prop({ required: true, enum: ['INBOUND', 'OUTBOUND'] })
  direction!: string;

  @Prop({
    required: true,
    default: 'INITIATED',
    enum: [
      'INITIATED',
      'RINGING',
      'IN_PROGRESS',
      'COMPLETED',
      'FAILED',
      'BUSY',
      'NO_ANSWER',
      'CANCELED',
    ],
  })
  status!: string;

  @Prop()
  durationSeconds?: number;

  @Prop()
  price?: number;

  @Prop()
  priceUnit?: string;

  @Prop()
  startedAt?: Date;

  @Prop()
  endedAt?: Date;
}

export const CallLogSchema = SchemaFactory.createForClass(CallLog);
CallLogSchema.index({ organizationId: 1, createdAt: -1 });
