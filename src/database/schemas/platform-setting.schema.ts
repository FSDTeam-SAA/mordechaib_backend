import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type PlatformSettingDocument = HydratedDocument<PlatformSetting>;

export enum PlatformSettingKey {
  GLOBAL = 'GLOBAL',
}

export const PLATFORM_DATE_FORMATS = [
  'MM/DD/YYYY',
  'DD/MM/YYYY',
  'YYYY-MM-DD',
] as const;
export const PLATFORM_TIME_FORMATS = ['12H', '24H'] as const;

@Schema({ timestamps: true, collection: 'platform_settings' })
export class PlatformSetting {
  createdAt?: Date;
  updatedAt?: Date;

  @Prop({
    required: true,
    enum: Object.values(PlatformSettingKey),
    unique: true,
    index: true,
  })
  key!: PlatformSettingKey;

  @Prop({ required: true, trim: true, maxlength: 120 })
  platformName!: string;

  @Prop({ required: true, trim: true, maxlength: 500 })
  platformUrl!: string;

  @Prop({ lowercase: true, trim: true, maxlength: 254 })
  supportEmail?: string;

  @Prop({ trim: true, maxlength: 32 })
  supportPhone?: string;

  @Prop({ required: true, trim: true, maxlength: 80 })
  timezone!: string;

  @Prop({ required: true, trim: true, maxlength: 16 })
  language!: string;

  @Prop({ required: true, trim: true, uppercase: true, maxlength: 3 })
  defaultCurrency!: string;

  @Prop({ required: true, type: String, enum: PLATFORM_DATE_FORMATS })
  dateFormat!: (typeof PLATFORM_DATE_FORMATS)[number];

  @Prop({ required: true, type: String, enum: PLATFORM_TIME_FORMATS })
  timeFormat!: (typeof PLATFORM_TIME_FORMATS)[number];

  @Prop({ required: true, default: false })
  maintenanceMode!: boolean;

  @Prop({ trim: true, maxlength: 2_048 })
  logoUrl?: string;

  @Prop({ trim: true, maxlength: 2_048 })
  faviconUrl?: string;

  @Prop({ required: true, min: 0, default: 0 })
  revision!: number;

  @Prop({ required: true })
  updatedByUserId!: string;
}

export const PlatformSettingSchema =
  SchemaFactory.createForClass(PlatformSetting);
