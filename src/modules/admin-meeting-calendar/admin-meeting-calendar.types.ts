import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  AdminMeetingSourceType,
  AdminMeetingStatus,
} from '../../common/enums/admin-meeting-status.enum';
import { CalendarProviderType } from '../../common/enums/calendar-provider.enum';
import { MeetingPlatform } from '../../common/enums/meeting-platform.enum';
import { MeetingType } from '../../common/enums/meeting-type.enum';
import { PlatformMeetingStatus } from '../../common/enums/platform-meeting-status.enum';

export class AdminMeetingOrganization {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;
}

export class AdminMeetingCalendarItem {
  @ApiProperty()
  id!: string;

  @ApiProperty({ enum: AdminMeetingSourceType })
  sourceType!: AdminMeetingSourceType;

  @ApiProperty({ type: AdminMeetingOrganization })
  organization!: AdminMeetingOrganization;

  @ApiProperty()
  title!: string;

  @ApiProperty({ nullable: true })
  description!: string | null;

  @ApiProperty({ format: 'date-time' })
  startsAt!: string;

  @ApiProperty({ format: 'date-time' })
  endsAt!: string;

  @ApiProperty()
  durationMinutes!: number;

  @ApiProperty()
  timezone!: string;

  @ApiProperty({ type: [String] })
  participantEmails!: string[];

  @ApiProperty({ enum: AdminMeetingStatus })
  status!: AdminMeetingStatus;

  @ApiProperty({ enum: MeetingType })
  meetingType!: MeetingType;

  @ApiProperty({ enum: CalendarProviderType, nullable: true })
  calendarProvider!: CalendarProviderType | null;

  @ApiProperty({ nullable: true })
  meetingPlatform!: string | null;

  @ApiProperty({ nullable: true })
  eventUrl!: string | null;

  @ApiProperty({ description: 'Enabled when the admin action API permits it.' })
  canComplete!: boolean;

  @ApiProperty({ description: 'Enabled when the admin action API permits it.' })
  canCancel!: boolean;

  @ApiProperty({ description: 'Enabled when the admin action API permits it.' })
  canDelete!: boolean;
}

export class AdminMeetingCalendarSummary {
  @ApiProperty()
  total!: number;

  @ApiProperty()
  pending!: number;

  @ApiProperty()
  confirmed!: number;

  @ApiProperty()
  completed!: number;

  @ApiProperty()
  cancelled!: number;

  @ApiProperty()
  failed!: number;
}

export class AdminMeetingTypeBreakdown {
  @ApiProperty({ enum: MeetingType })
  meetingType!: MeetingType;

  @ApiProperty()
  count!: number;

  @ApiProperty({ minimum: 0, maximum: 100 })
  percentage!: number;
}

export class AdminMeetingCalendarPagination {
  @ApiProperty()
  page!: number;

  @ApiProperty()
  limit!: number;

  @ApiProperty()
  total!: number;

  @ApiProperty()
  pages!: number;
}

export class AdminMeetingCalendarResponse {
  @ApiProperty({ format: 'date-time' })
  asOf!: string;

  @ApiProperty()
  timezone!: string;

  @ApiProperty({
    example: {
      from: '2026-11-01T00:00:00.000Z',
      to: '2026-12-01T00:00:00.000Z',
    },
  })
  range!: { from: string; to: string };

  @ApiProperty({ type: AdminMeetingCalendarSummary })
  summary!: AdminMeetingCalendarSummary;

  @ApiProperty({ type: [AdminMeetingTypeBreakdown] })
  meetingTypes!: AdminMeetingTypeBreakdown[];

  @ApiProperty({ type: [AdminMeetingCalendarItem] })
  items!: AdminMeetingCalendarItem[];

  @ApiProperty({ type: [AdminMeetingCalendarItem] })
  upcoming!: AdminMeetingCalendarItem[];

  @ApiProperty({ type: AdminMeetingCalendarPagination })
  pagination!: AdminMeetingCalendarPagination;
}

export class AdminMeetingCalendarActionResponse {
  @ApiProperty()
  id!: string;

  @ApiProperty({ enum: AdminMeetingSourceType })
  sourceType!: AdminMeetingSourceType;

  @ApiProperty()
  organizationId!: string;

  @ApiProperty({ enum: ['COMPLETE', 'CANCEL', 'DELETE'] })
  action!: 'COMPLETE' | 'CANCEL' | 'DELETE';

  @ApiProperty({ enum: AdminMeetingStatus })
  status!: AdminMeetingStatus;

  @ApiProperty({ format: 'date-time' })
  changedAt!: string;

  @ApiProperty({ required: false })
  deleted?: boolean;
}

export class AdminScheduledMeetingResponse {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  organizationId!: string;

  @ApiProperty()
  createdByUserId!: string;

  @ApiProperty({ enum: MeetingPlatform })
  platform!: MeetingPlatform;

  @ApiProperty()
  title!: string;

  @ApiPropertyOptional()
  agenda?: string;

  @ApiProperty({ format: 'date-time' })
  startsAt!: string;

  @ApiProperty({ format: 'date-time' })
  endsAt!: string;

  @ApiProperty()
  durationMinutes!: number;

  @ApiProperty()
  timezone!: string;

  @ApiProperty({ type: [String] })
  invitees!: string[];

  @ApiProperty({ type: [String] })
  contactIds!: string[];

  @ApiProperty({ enum: PlatformMeetingStatus })
  status!: PlatformMeetingStatus;

  @ApiProperty()
  botRequested!: boolean;

  @ApiProperty()
  reminderMinutesBeforeStart!: number;

  @ApiPropertyOptional({ enum: CalendarProviderType })
  calendarProvider?: CalendarProviderType;

  @ApiPropertyOptional()
  providerMeetingId?: string;

  @ApiPropertyOptional()
  meetingBotId?: string;

  @ApiPropertyOptional()
  calendarEventId?: string;

  @ApiPropertyOptional()
  calendarEventUrl?: string;

  @ApiPropertyOptional()
  joinUrl?: string;

  @ApiPropertyOptional()
  startUrl?: string;

  @ApiPropertyOptional()
  aiActionProposalId?: string;

  @ApiPropertyOptional({ type: Object })
  metadata?: Record<string, unknown>;

  @ApiPropertyOptional({ format: 'date-time' })
  createdAt?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  updatedAt?: string;

  @ApiPropertyOptional({
    description:
      'True when the same idempotency key already created this meeting.',
  })
  duplicate?: boolean;
}

export class AdminCalendarSyncProviderResult {
  @ApiProperty({ enum: CalendarProviderType })
  provider!: CalendarProviderType;

  @ApiProperty({ enum: ['SYNCHRONIZED', 'FAILED'] })
  status!: 'SYNCHRONIZED' | 'FAILED';

  @ApiProperty()
  synchronized!: number;

  @ApiPropertyOptional()
  skipped?: number;

  @ApiPropertyOptional()
  error?: string;
}

export class AdminCalendarSyncResponse {
  @ApiProperty({ enum: ['AVAILABLE', 'PARTIAL'] })
  availability!: 'AVAILABLE' | 'PARTIAL';

  @ApiProperty({ format: 'date-time' })
  synchronizedAt!: string;

  @ApiProperty({
    example: {
      from: '2026-11-01T00:00:00.000Z',
      to: '2026-12-01T00:00:00.000Z',
    },
  })
  range!: { from: string; to: string };

  @ApiProperty({ type: [AdminCalendarSyncProviderResult] })
  providers!: AdminCalendarSyncProviderResult[];

  @ApiProperty()
  totalSynchronized!: number;
}
