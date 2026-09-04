import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { TwilioCountry } from '../../common/enums/twilio-country.enum';
import { TwilioProvisioningStatus } from '../../common/enums/twilio-provisioning-status.enum';

export type TwilioAccountDocument = HydratedDocument<TwilioAccount>;

@Schema({ timestamps: true, collection: 'twilio_accounts' })
export class TwilioAccount {
  @Prop({ required: true, unique: true, index: true })
  organizationId!: string;

  @Prop({ unique: true, sparse: true, index: true })
  subaccountSid?: string;

  @Prop({ select: false })
  authTokenEncrypted?: string;

  @Prop({ required: true, trim: true })
  friendlyName!: string;

  @Prop({ required: true, enum: Object.values(TwilioCountry) })
  selectedCountry!: TwilioCountry;

  @Prop({ required: true, trim: true })
  selectedPhoneNumber!: string;

  @Prop({ required: true, trim: true })
  forwardingNumber!: string;

  @Prop({ required: true, default: true })
  isRecordingEnabled!: boolean;

  @Prop({ required: true, unique: true, index: true })
  operationId!: string;

  @Prop({
    required: true,
    enum: Object.values(TwilioProvisioningStatus),
    index: true,
  })
  provisioningStatus!: TwilioProvisioningStatus;

  @Prop({ enum: ['active', 'suspended', 'closed'] })
  remoteStatus?: string;

  @Prop({ trim: true })
  lastErrorCode?: string;

  @Prop({ trim: true })
  lastErrorMessage?: string;

  @Prop({ default: 0, min: 0 })
  retryCount!: number;

  @Prop()
  lastAttemptAt?: Date;

  @Prop()
  provisionedAt?: Date;

  @Prop()
  suspendedAt?: Date;

  @Prop()
  closedAt?: Date;

  @Prop({ enum: ['OWNER_REQUEST', 'SUBSCRIPTION_CANCELED'] })
  closureReason?: string;

  @Prop()
  retentionExpiresAt?: Date;

  @Prop({ type: [String], default: [] })
  previousSubaccountSids!: string[];
}

export const TwilioAccountSchema = SchemaFactory.createForClass(TwilioAccount);
TwilioAccountSchema.index({ organizationId: 1, provisioningStatus: 1 });
