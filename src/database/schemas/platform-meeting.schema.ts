import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { MeetingPlatform } from '../../common/enums/meeting-platform.enum';
import { PlatformMeetingStatus } from '../../common/enums/platform-meeting-status.enum';
import { CalendarProviderType } from '../../common/enums/calendar-provider.enum';

export type PlatformMeetingDocument = HydratedDocument<PlatformMeeting>;

@Schema({ timestamps: true, collection: 'platform_meetings' })
export class PlatformMeeting {
  @Prop({ required: true, enum: Object.values(MeetingPlatform), index: true })
  platform!: MeetingPlatform;

  @Prop({ required: true, index: true })
  organizationId!: string;

  @Prop({ required: true, index: true })
  createdByUserId!: string;

  @Prop({ required: true, unique: true, index: true, select: false })
  idempotencyHash!: string;

  @Prop({ index: true, sparse: true })
  providerMeetingId?: string;

  @Prop({ index: true, sparse: true })
  meetingBotId?: string;

  @Prop({ enum: Object.values(CalendarProviderType), index: true })
  calendarProvider?: CalendarProviderType;

  @Prop({ index: true, sparse: true })
  calendarEventId?: string;

  @Prop()
  calendarEventUrl?: string;

  @Prop({ required: true, trim: true })
  title!: string;

  @Prop()
  agenda?: string;

  @Prop({ required: true, index: true })
  startsAt!: Date;

  @Prop({ required: true })
  endsAt!: Date;

  @Prop({ required: true })
  durationMinutes!: number;

  @Prop({ required: true })
  timezone!: string;

  @Prop({ type: [String], default: [] })
  invitees!: string[];

  @Prop({ select: false })
  joinUrlEncrypted?: string;

  @Prop({ select: false })
  startUrlEncrypted?: string;

  @Prop({
    required: true,
    enum: Object.values(PlatformMeetingStatus),
    default: PlatformMeetingStatus.CREATING,
    index: true,
  })
  status!: PlatformMeetingStatus;

  @Prop()
  failureCode?: string;

  @Prop()
  failureMessage?: string;

  @Prop({ default: true })
  botRequested!: boolean;

  @Prop({ default: 15, min: 0, max: 40320 })
  reminderMinutesBeforeStart!: number;

  @Prop({ type: Object, default: {} })
  metadata?: Record<string, unknown>;
}

export const PlatformMeetingSchema =
  SchemaFactory.createForClass(PlatformMeeting);
PlatformMeetingSchema.index({ organizationId: 1, startsAt: -1 });
PlatformMeetingSchema.index({ organizationId: 1, platform: 1, startsAt: -1 });
