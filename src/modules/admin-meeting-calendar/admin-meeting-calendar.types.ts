import { ApiProperty } from '@nestjs/swagger';
import {
  AdminMeetingSourceType,
  AdminMeetingStatus,
} from '../../common/enums/admin-meeting-status.enum';
import { CalendarProviderType } from '../../common/enums/calendar-provider.enum';
import { MeetingType } from '../../common/enums/meeting-type.enum';

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
