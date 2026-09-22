import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import {
  NotificationEmailStatus,
  NotificationType,
} from '../../common/enums/notification-type.enum';

export type NotificationDocument = HydratedDocument<Notification>;

@Schema({ timestamps: true, collection: 'notifications' })
export class Notification {
  createdAt?: Date;
  updatedAt?: Date;

  @Prop({ required: true, index: true })
  organizationId!: string;

  @Prop({ required: true, index: true })
  userId!: string;

  @Prop({ required: true, enum: Object.values(NotificationType), index: true })
  type!: NotificationType;

  @Prop({ required: true, trim: true, maxlength: 200 })
  title!: string;

  @Prop({ required: true, trim: true, maxlength: 2000 })
  message!: string;

  @Prop({ trim: true, maxlength: 1000 })
  actionUrl?: string;

  @Prop({ type: Object, default: {} })
  metadata!: Record<string, unknown>;

  @Prop({ required: true, unique: true, index: true, maxlength: 500 })
  dedupeKey!: string;

  @Prop({ default: true, index: true })
  inAppVisible!: boolean;

  @Prop({
    required: true,
    enum: Object.values(NotificationEmailStatus),
    default: NotificationEmailStatus.SKIPPED,
  })
  emailStatus!: NotificationEmailStatus;

  @Prop()
  emailSentAt?: Date;

  @Prop({ trim: true, maxlength: 500 })
  emailFailureMessage?: string;

  @Prop({ index: true })
  readAt?: Date;
}

export const NotificationSchema = SchemaFactory.createForClass(Notification);
NotificationSchema.index({ userId: 1, inAppVisible: 1, createdAt: -1 });
NotificationSchema.index({ userId: 1, inAppVisible: 1, readAt: 1 });

