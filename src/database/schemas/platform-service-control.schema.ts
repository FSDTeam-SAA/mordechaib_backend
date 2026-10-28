import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type PlatformServiceControlDocument =
  HydratedDocument<PlatformServiceControl>;

export enum PlatformServiceKey {
  AI_BACKEND = 'AI_BACKEND',
}

@Schema({ timestamps: true, collection: 'platform_service_controls' })
export class PlatformServiceControl {
  @Prop({
    required: true,
    enum: Object.values(PlatformServiceKey),
    unique: true,
    index: true,
  })
  service!: PlatformServiceKey;

  @Prop({ required: true, default: true })
  enabled!: boolean;

  @Prop({ trim: true, maxlength: 500 })
  reason?: string;

  @Prop({ required: true })
  changedByUserId!: string;

  @Prop({ required: true })
  changedAt!: Date;
}

export const PlatformServiceControlSchema = SchemaFactory.createForClass(
  PlatformServiceControl,
);
