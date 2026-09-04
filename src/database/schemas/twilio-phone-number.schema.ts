import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { TwilioCountry } from '../../common/enums/twilio-country.enum';
import { TwilioPhoneNumberStatus } from '../../common/enums/twilio-phone-number-status.enum';

export type TwilioPhoneNumberDocument = HydratedDocument<TwilioPhoneNumber>;

@Schema({ timestamps: true, collection: 'twilio_phone_numbers' })
export class TwilioPhoneNumber {
  @Prop({ required: true, index: true })
  organizationId!: string;

  @Prop({ required: true, index: true })
  subaccountSid!: string;

  @Prop({ required: true, unique: true, index: true })
  phoneNumberSid!: string;

  @Prop({ required: true, trim: true })
  phoneNumber!: string;

  @Prop({ required: true, enum: Object.values(TwilioCountry) })
  country!: TwilioCountry;

  @Prop({ required: true, default: 'LOCAL' })
  numberType!: string;

  @Prop({ type: Object, default: {} })
  capabilities!: { voice: boolean; sms: boolean; mms: boolean };

  @Prop({ trim: true })
  addressRequirements?: string;

  @Prop({ trim: true })
  voiceUrl?: string;

  @Prop({
    required: true,
    default: TwilioPhoneNumberStatus.ACTIVE,
    enum: Object.values(TwilioPhoneNumberStatus),
    index: true,
  })
  status!: TwilioPhoneNumberStatus;

  @Prop()
  purchasedAt?: Date;

  @Prop()
  releasedAt?: Date;
}

export const TwilioPhoneNumberSchema =
  SchemaFactory.createForClass(TwilioPhoneNumber);
TwilioPhoneNumberSchema.index(
  { organizationId: 1, status: 1 },
  {
    unique: true,
    partialFilterExpression: { status: TwilioPhoneNumberStatus.ACTIVE },
  },
);
TwilioPhoneNumberSchema.index(
  { phoneNumber: 1 },
  {
    unique: true,
    partialFilterExpression: { status: TwilioPhoneNumberStatus.ACTIVE },
  },
);
