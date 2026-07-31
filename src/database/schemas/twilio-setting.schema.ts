import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type TwilioSettingDocument = HydratedDocument<TwilioSetting>;

@Schema({ timestamps: true, collection: 'twilio_settings' })
export class TwilioSetting {
  @Prop({ required: true, unique: true, index: true })
  organizationId!: string;

  @Prop({ required: true, unique: true, index: true, trim: true })
  twilioNumber!: string;

  @Prop({ required: true, trim: true })
  forwardingNumber!: string;

  @Prop({ required: true, default: true })
  isRecordingEnabled!: boolean;

  @Prop({
    required: true,
    default: 'ACTIVE',
    enum: ['ACTIVE', 'INACTIVE'],
    index: true,
  })
  status!: string;
}

export const TwilioSettingSchema = SchemaFactory.createForClass(TwilioSetting);
TwilioSettingSchema.index({ twilioNumber: 1, status: 1 });
