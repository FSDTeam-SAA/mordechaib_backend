import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type PlatformNotificationSettingDocument =
  HydratedDocument<PlatformNotificationSetting>;

export enum PlatformNotificationSettingKey {
  GLOBAL = 'GLOBAL',
}

@Schema({ timestamps: true, collection: 'platform_notification_settings' })
export class PlatformNotificationSetting {
  createdAt?: Date;
  updatedAt?: Date;

  @Prop({
    required: true,
    enum: Object.values(PlatformNotificationSettingKey),
    unique: true,
    index: true,
  })
  key!: PlatformNotificationSettingKey;

  @Prop({ required: true, default: true })
  newOrganizationRegistered!: boolean;

  @Prop({ required: true, default: true })
  subscriptionPaymentReceived!: boolean;

  @Prop({ required: true, default: true })
  failedPayment!: boolean;

  @Prop({ required: true, default: true })
  userReportedIssue!: boolean;

  @Prop({ required: true, default: true })
  agentErrorDetected!: boolean;

  @Prop({ required: true, default: true })
  systemHealthAlert!: boolean;

  @Prop({ type: [String], default: [] })
  emailRecipients!: string[];

  @Prop({ required: true, min: 0, default: 0 })
  revision!: number;

  @Prop({ required: true })
  updatedByUserId!: string;
}

export const PlatformNotificationSettingSchema = SchemaFactory.createForClass(
  PlatformNotificationSetting,
);
