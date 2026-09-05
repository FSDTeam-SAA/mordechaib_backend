import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type NotificationPreferenceDocument =
  HydratedDocument<NotificationPreference>;

@Schema({ timestamps: true, collection: 'notification_preferences' })
export class NotificationPreference {
  @Prop({ required: true, unique: true, index: true })
  userId!: string;

  @Prop({ default: true })
  emailNotifications!: boolean;

  @Prop({ default: true })
  inAppNotifications!: boolean;

  @Prop({ default: true })
  agentTaskCompletions!: boolean;

  @Prop({ default: true })
  meetingReminders!: boolean;

  @Prop({ default: true })
  weeklyRoiReports!: boolean;

  @Prop({ default: true })
  productUpdates!: boolean;

  @Prop()
  updatedBy?: string;
}

export const NotificationPreferenceSchema = SchemaFactory.createForClass(
  NotificationPreference,
);
