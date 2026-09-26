import { BadRequestException, Injectable } from '@nestjs/common';
import { CalendarEventStatus } from '../../common/enums/calendar-event-status.enum';
import { MeetingUrgency } from '../../common/enums/meeting-urgency.enum';
import { PlatformMeetingStatus } from '../../common/enums/platform-meeting-status.enum';
import { CalendarDashboardRepository } from './calendar-dashboard.repository';
import { CalendarDashboardQueryDto } from './dto/calendar-dashboard-query.dto';

type DashboardStatus = 'SCHEDULED' | 'COMPLETED' | 'CANCELLED' | 'FAILED';

type DashboardMeeting = {
  id: string;
  sourceType: 'PLATFORM_MEETING' | 'CALENDAR_EVENT';
  title: string;
  description?: string;
  startsAt: Date;
  endsAt: Date;
  durationMinutes: number;
  timezone: string;
  participantEmails: string[];
  status: DashboardStatus;
  provider: string;
  eventUrl?: string;
  meetingType?: string;
  urgency?: MeetingUrgency;
  importedFromProvider?: boolean;
};

@Injectable()
export class CalendarDashboardService {
  constructor(private readonly repository: CalendarDashboardRepository) {}

  async get(
    organizationId: string,
    query: CalendarDashboardQueryDto,
    now = new Date(),
  ) {
    const from = new Date(query.from);
    const to = new Date(query.to);
    if (from >= to) throw new BadRequestException('from must be before to');
    if (to.getTime() - from.getTime() > 730 * 24 * 60 * 60_000) {
      throw new BadRequestException(
        'Calendar dashboard range cannot exceed 730 days',
      );
    }
    this.assertTimezone(query.timezone);

    const [records, operations] = await Promise.all([
      this.repository.meetings(organizationId, from, to),
      this.repository.operationalMetrics(organizationId, from, to, now),
    ]);
    const items = this.mergeMeetings(records);
    const reportable = items.filter((item) => item.status !== 'FAILED');
    const series = this.series(reportable, query.timezone);
    const active = reportable.filter((item) => item.status === 'SCHEDULED');
    const upcoming = active
      .filter((item) => item.startsAt >= now)
      .slice(0, query.upcomingLimit);
    const priorityItems = reportable.filter((item) => !!item.urgency);

    return {
      asOf: now.toISOString(),
      timezone: query.timezone,
      range: { from: from.toISOString(), to: to.toISOString() },
      dataAvailability: records.truncated
        ? {
            availability: 'PARTIAL',
            reason: 'CALENDAR_RANGE_RESULT_LIMIT_REACHED',
          }
        : { availability: 'AVAILABLE' },
      summary: {
        total: reportable.length,
        scheduled: reportable.filter((item) => item.status === 'SCHEDULED')
          .length,
        completed: reportable.filter((item) => item.status === 'COMPLETED')
          .length,
        cancelled: reportable.filter((item) => item.status === 'CANCELLED')
          .length,
        failed: items.filter((item) => item.status === 'FAILED').length,
        series,
      },
      items,
      upcoming,
      conflicts: {
        items: this.conflicts(active, query.bufferMinutes, query.conflictLimit),
        travelTime: {
          availability: 'UNAVAILABLE',
          reason: 'MEETING_LOCATIONS_NOT_CAPTURED',
        },
      },
      taskAndCalls: {
        tasksCreatedFromCalls: operations.tasksFromCalls,
        upcomingDeadlines: operations.upcomingDeadlines,
        aiReminders: operations.aiReminders,
        followUpsPending: {
          availability: 'UNAVAILABLE',
          value: null,
          reason: 'FOLLOW_UP_WORKFLOW_NOT_CONFIGURED',
        },
        crmUpdatesToday: {
          availability: 'UNAVAILABLE',
          value: null,
          reason: 'CRM_FOUNDATION_NOT_IMPLEMENTED',
        },
      },
      priority: {
        availability:
          priorityItems.length === reportable.length ? 'AVAILABLE' : 'PARTIAL',
        classified: priorityItems.length,
        unclassified: reportable.length - priorityItems.length,
        counts: {
          high: priorityItems.filter(
            (item) => item.urgency === MeetingUrgency.HIGH,
          ).length,
          medium: priorityItems.filter(
            (item) => item.urgency === MeetingUrgency.MEDIUM,
          ).length,
          low: priorityItems.filter(
            (item) => item.urgency === MeetingUrgency.LOW,
          ).length,
        },
        averageScore: {
          availability: 'UNAVAILABLE',
          value: null,
          reason: 'MEETING_PRIORITY_SCORE_METHODOLOGY_NOT_CONFIGURED',
        },
        confidenceScores: {
          availability: 'UNAVAILABLE',
          items: [],
          reason: 'AI_MEETING_SCORING_NOT_IMPLEMENTED',
        },
      },
      automation: {
        notesGenerated: operations.notesGenerated,
        actionItemsCreated: operations.actionItemsCreated,
        tasksAssigned: operations.tasksAssigned,
        followUpEmailsSent: {
          availability: 'UNAVAILABLE',
          value: null,
          reason: 'EMAILS_NOT_LINKED_TO_MEETINGS',
        },
        crmRecordsUpdated: {
          availability: 'UNAVAILABLE',
          value: null,
          reason: 'CRM_FOUNDATION_NOT_IMPLEMENTED',
        },
        customerHealthUpdated: {
          availability: 'UNAVAILABLE',
          value: null,
          reason: 'CUSTOMER_FOUNDATION_NOT_IMPLEMENTED',
        },
      },
      aiScheduling: {
        availability: 'UNAVAILABLE',
        suggestions: [],
        reason: 'AI_SCHEDULING_CONTRACT_NOT_IMPLEMENTED',
      },
    };
  }

  private mergeMeetings(
    records: Awaited<ReturnType<CalendarDashboardRepository['meetings']>>,
  ) {
    const unique = new Map<string, DashboardMeeting>();
    for (const meeting of records.platform) {
      const botCompleted =
        !!meeting.meetingBotId &&
        records.completedBotIds.has(String(meeting.meetingBotId));
      const status = this.platformStatus(String(meeting.status), botCompleted);
      const key = meeting.calendarEventId
        ? `calendar:${String(meeting.calendarProvider)}:${String(meeting.calendarEventId)}`
        : `platform:${String(meeting._id)}`;
      unique.set(key, {
        id: String(meeting._id),
        sourceType: 'PLATFORM_MEETING',
        title: meeting.title,
        description: meeting.agenda,
        startsAt: meeting.startsAt,
        endsAt: meeting.endsAt,
        durationMinutes: meeting.durationMinutes,
        timezone: meeting.timezone,
        participantEmails: meeting.invitees || [],
        status,
        provider: String(meeting.platform),
        eventUrl: meeting.calendarEventUrl,
      });
    }
    for (const event of records.calendar) {
      const key = event.providerEventId
        ? `calendar:${String(event.provider)}:${String(event.providerEventId)}`
        : `event:${String(event._id)}`;
      if (unique.has(key)) continue;
      unique.set(key, {
        id: String(event._id),
        sourceType: 'CALENDAR_EVENT',
        title: event.title,
        description: event.description,
        startsAt: event.startsAt,
        endsAt: event.endsAt,
        durationMinutes: Math.max(
          0,
          Math.round(
            (event.endsAt.getTime() - event.startsAt.getTime()) / 60_000,
          ),
        ),
        timezone: event.timezone,
        participantEmails: event.attendees || [],
        status: this.calendarStatus(String(event.status)),
        provider: String(event.provider),
        eventUrl: event.providerEventUrl,
        meetingType: String(event.meetingType),
        urgency: event.urgency,
        importedFromProvider: event.importedFromProvider === true,
      });
    }
    return [...unique.values()].sort(
      (left, right) => left.startsAt.getTime() - right.startsAt.getTime(),
    );
  }

  private platformStatus(
    status: string,
    botCompleted: boolean,
  ): DashboardStatus {
    if (status === PlatformMeetingStatus.CANCELLED) return 'CANCELLED';
    if (status === PlatformMeetingStatus.FAILED) return 'FAILED';
    if (status === PlatformMeetingStatus.COMPLETED || botCompleted) {
      return 'COMPLETED';
    }
    return 'SCHEDULED';
  }

  private calendarStatus(status: string): DashboardStatus {
    if (status === CalendarEventStatus.CANCELLED) return 'CANCELLED';
    if (status === CalendarEventStatus.FAILED) return 'FAILED';
    return 'SCHEDULED';
  }

  private series(items: DashboardMeeting[], timezone: string) {
    const rows = new Map<string, Record<DashboardStatus | 'total', number>>();
    for (const item of items) {
      const date = this.localDate(item.startsAt, timezone);
      const row = rows.get(date) || {
        total: 0,
        SCHEDULED: 0,
        COMPLETED: 0,
        CANCELLED: 0,
        FAILED: 0,
      };
      row.total += 1;
      row[item.status] += 1;
      rows.set(date, row);
    }
    return [...rows.entries()].map(([date, row]) => ({
      date,
      total: row.total,
      scheduled: row.SCHEDULED,
      completed: row.COMPLETED,
      cancelled: row.CANCELLED,
    }));
  }

  private conflicts(
    items: DashboardMeeting[],
    bufferMinutes: number,
    limit: number,
  ) {
    const bufferMs = bufferMinutes * 60_000;
    const conflicts: Array<Record<string, unknown>> = [];
    const active: DashboardMeeting[] = [];
    for (const current of items) {
      while (
        active.length &&
        active[0].endsAt.getTime() + bufferMs <= current.startsAt.getTime()
      ) {
        active.shift();
      }
      for (const previous of active) {
        const overlap = previous.endsAt > current.startsAt;
        conflicts.push({
          type: overlap ? 'OVERLAP' : 'INSUFFICIENT_BUFFER',
          meetingIds: [previous.id, current.id],
          meetings: [previous.title, current.title],
          startsAt: current.startsAt,
          ...(overlap
            ? {
                overlapMinutes: Math.ceil(
                  (Math.min(
                    previous.endsAt.getTime(),
                    current.endsAt.getTime(),
                  ) -
                    current.startsAt.getTime()) /
                    60_000,
                ),
              }
            : { requiredBufferMinutes: bufferMinutes }),
        });
        if (conflicts.length >= limit) return conflicts;
      }
      active.push(current);
      active.sort(
        (left, right) => left.endsAt.getTime() - right.endsAt.getTime(),
      );
    }
    return conflicts;
  }

  private localDate(value: Date, timezone: string) {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(value);
    const part = (type: string) =>
      parts.find((item) => item.type === type)?.value || '';
    return `${part('year')}-${part('month')}-${part('day')}`;
  }

  private assertTimezone(timezone: string) {
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format();
    } catch {
      throw new BadRequestException('timezone must be a valid IANA timezone');
    }
  }
}
