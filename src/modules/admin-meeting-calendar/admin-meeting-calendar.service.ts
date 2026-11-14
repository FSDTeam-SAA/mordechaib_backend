import { BadRequestException, Injectable } from '@nestjs/common';
import { AdminMeetingStatus } from '../../common/enums/admin-meeting-status.enum';
import { MeetingType } from '../../common/enums/meeting-type.enum';
import { CalendarEventStatus } from '../../common/enums/calendar-event-status.enum';
import { PlatformMeetingStatus } from '../../common/enums/platform-meeting-status.enum';
import { adminMeetingCapabilities } from './admin-meeting-capabilities';
import {
  AdminMeetingCalendarItem,
  AdminMeetingCalendarResponse,
  AdminMeetingCalendarSummary,
} from './admin-meeting-calendar.types';
import { AdminMeetingCalendarRepository } from './admin-meeting-calendar.repository';
import { AdminMeetingCalendarQueryDto } from './dto/admin-meeting-calendar-query.dto';

const MAX_RANGE_MS = 366 * 24 * 60 * 60_000;

@Injectable()
export class AdminMeetingCalendarService {
  constructor(private readonly repository: AdminMeetingCalendarRepository) {}

  async dashboard(
    query: AdminMeetingCalendarQueryDto,
    now = new Date(),
  ): Promise<AdminMeetingCalendarResponse> {
    this.assertRange(query.from, query.to);
    const result = await this.repository.dashboard(query, now);
    const summary: AdminMeetingCalendarSummary = result.summary || {
      total: 0,
      pending: 0,
      confirmed: 0,
      completed: 0,
      cancelled: 0,
      failed: 0,
    };
    const meetingTypeTotal = result.meetingTypes.reduce(
      (total, row) => total + row.count,
      0,
    );

    return {
      asOf: now.toISOString(),
      timezone: query.timezone,
      range: {
        from: query.from.toISOString(),
        to: query.to.toISOString(),
      },
      summary,
      meetingTypes: result.meetingTypes.map((row) => ({
        meetingType: row.meetingType,
        count: row.count,
        percentage: meetingTypeTotal
          ? Math.round((row.count / meetingTypeTotal) * 10_000) / 100
          : 0,
      })),
      items: result.items.map((item) => this.toItem(item, now)),
      upcoming: result.upcoming.map((item) => this.toItem(item, now)),
      pagination: {
        page: query.page,
        limit: query.limit,
        total: result.total,
        pages: Math.ceil(result.total / query.limit),
      },
    };
  }

  private assertRange(from: Date, to: Date) {
    if (from >= to) {
      throw new BadRequestException('from must be before to');
    }
    if (to.getTime() - from.getTime() > MAX_RANGE_MS) {
      throw new BadRequestException(
        'Admin meeting calendar range cannot exceed 366 days',
      );
    }
  }

  private toItem(
    row: Record<string, unknown>,
    now: Date,
  ): AdminMeetingCalendarItem {
    const status = row.status as AdminMeetingStatus;
    const sourceType = row.sourceType as AdminMeetingCalendarItem['sourceType'];
    const startsAt = this.date(row.startsAt);
    const capabilities = adminMeetingCapabilities({
      sourceType,
      rawStatus: row.rawStatus as PlatformMeetingStatus | CalendarEventStatus,
      status,
      startsAt,
      now,
    });
    return {
      id: String(row.id),
      sourceType,
      organization:
        row.organization as AdminMeetingCalendarItem['organization'],
      title: String(row.title),
      description: typeof row.description === 'string' ? row.description : null,
      startsAt: startsAt.toISOString(),
      endsAt: this.isoDate(row.endsAt),
      durationMinutes: Number(row.durationMinutes) || 0,
      timezone: String(row.timezone),
      participantEmails: Array.isArray(row.participantEmails)
        ? row.participantEmails.map(String)
        : [],
      status,
      meetingType: (row.meetingType as MeetingType) || MeetingType.OTHER,
      calendarProvider:
        (row.calendarProvider as AdminMeetingCalendarItem['calendarProvider']) ||
        null,
      meetingPlatform:
        typeof row.meetingPlatform === 'string' ? row.meetingPlatform : null,
      eventUrl: typeof row.eventUrl === 'string' ? row.eventUrl : null,
      ...capabilities,
    };
  }

  private isoDate(value: unknown) {
    return this.date(value).toISOString();
  }

  private date(value: unknown) {
    if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
      throw new BadRequestException('Stored meeting date is invalid');
    }
    return value;
  }
}
