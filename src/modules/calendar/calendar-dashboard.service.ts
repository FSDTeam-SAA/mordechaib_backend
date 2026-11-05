import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CalendarEventStatus } from '../../common/enums/calendar-event-status.enum';
import { CalendarProviderType } from '../../common/enums/calendar-provider.enum';
import { decryptText } from '../../common/helpers/crypto.helper';
import { MeetingUrgency } from '../../common/enums/meeting-urgency.enum';
import { PlatformMeetingStatus } from '../../common/enums/platform-meeting-status.enum';
import { MeetingPrioritySource } from '../../common/enums/meeting-priority-source.enum';
import { localDayRange } from '../../common/helpers/local-date-range.helper';
import { OrganizationsService } from '../organizations/organizations.service';
import { CalendarDashboardRepository } from './calendar-dashboard.repository';
import { CalendarService } from './calendar.service';
import {
  CalendarPriorityAssessment,
  CalendarPriorityService,
} from './calendar-priority.service';
import { CalendarSchedulingService } from './calendar-scheduling.service';
import { CalendarDashboardQueryDto } from './dto/calendar-dashboard-query.dto';
import { CalendarTravelTimeService } from './calendar-travel-time.service';
import { MEETING_FOLLOW_UP_DETECTION_THRESHOLD } from '../../common/enums/meeting-follow-up-status.enum';

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
  /** Backward-compatible alias of calendarProvider. */
  provider: CalendarProviderType;
  calendarProvider: CalendarProviderType;
  calendarEventId?: string;
  meetingPlatform?: string;
  eventUrl?: string;
  joinUrl?: string;
  meetingType?: string;
  urgency?: MeetingUrgency;
  prioritySource?: MeetingPrioritySource;
  priority: CalendarPriorityAssessment;
  importedFromProvider?: boolean;
  location?: {
    label?: string;
    address?: string;
    latitude?: number;
    longitude?: number;
  };
  aiConfidence?: number;
};

@Injectable()
export class CalendarDashboardService {
  constructor(
    private readonly repository: CalendarDashboardRepository,
    private readonly config: ConfigService,
    private readonly calendars: CalendarService,
    private readonly organizations: OrganizationsService,
    private readonly priorities: CalendarPriorityService,
    private readonly scheduling: CalendarSchedulingService,
    private readonly travelTime: CalendarTravelTimeService,
  ) {}

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

    const [calendarProvider, organization] = await Promise.all([
      this.calendars.getDefaultProvider(organizationId),
      this.organizations.findCurrent(organizationId),
    ]);
    const today = localDayRange(now, query.timezone);
    const [records, operations] = await Promise.all([
      this.repository.meetings(organizationId, calendarProvider, from, to),
      this.repository.operationalMetrics(
        organizationId,
        from,
        to,
        now,
        today,
      ),
    ]);
    const items = this.mergeMeetings(records, now);
    const reportable = items.filter((item) => item.status !== 'FAILED');
    const series = this.series(reportable, query.timezone);
    const active = reportable.filter((item) => item.status === 'SCHEDULED');
    const upcoming = active
      .filter((item) => item.startsAt >= now)
      .slice(0, query.upcomingLimit);
    const priorityItems = reportable.filter(
      (item) => item.priority.availability === 'AVAILABLE',
    );
    const averagePriorityScore = priorityItems.length
      ? Math.round(
          priorityItems.reduce(
            (total, item) => total + Number(item.priority.score),
            0,
          ) / priorityItems.length,
        )
      : null;
    const confidenceItems = reportable.filter(
      (item) => typeof item.aiConfidence === 'number',
    );

    return {
      asOf: now.toISOString(),
      timezone: query.timezone,
      calendarProvider,
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
        travelTime: this.travelTime.assess(
          active,
          query.bufferMinutes,
          query.conflictLimit,
        ),
      },
      taskAndCalls: {
        tasksCreatedFromCalls: operations.tasksFromCalls,
        upcomingDeadlines: operations.upcomingDeadlines,
        aiReminders: operations.aiReminders,
        followUpsPending: {
          availability: 'AVAILABLE',
          value: operations.followUpsPending,
          source: 'PERSISTED_MEETING_FOLLOW_UP_SIGNALS',
          detectionThreshold: MEETING_FOLLOW_UP_DETECTION_THRESHOLD,
          isEstimated: false,
        },
        crmUpdatesToday: {
          availability: 'AVAILABLE',
          value: operations.crmUpdatesToday,
          source: 'CRM_MUTATION_AUDIT_LOG',
          isEstimated: false,
        },
      },
      priority: {
        availability: this.coverageAvailability(
          reportable.length,
          priorityItems.length,
          true,
        ),
        classified: priorityItems.length,
        unclassified: reportable.length - priorityItems.length,
        counts: {
          high: priorityItems.filter(
            (item) => item.priority.urgency === MeetingUrgency.HIGH,
          ).length,
          medium: priorityItems.filter(
            (item) => item.priority.urgency === MeetingUrgency.MEDIUM,
          ).length,
          low: priorityItems.filter(
            (item) => item.priority.urgency === MeetingUrgency.LOW,
          ).length,
        },
        averageScore: {
          availability: this.coverageAvailability(
            reportable.length,
            priorityItems.length,
            false,
          ),
          value: averagePriorityScore,
          methodologyVersion: 'URGENCY_WEIGHTED_V1',
          scoreMapping: { HIGH: 90, MEDIUM: 60, LOW: 30 },
          isEstimated: false,
          ...(priorityItems.length
            ? {}
            : { reason: 'NO_EXPLICITLY_CLASSIFIED_MEETINGS' }),
        },
        confidenceScores: {
          availability: this.coverageAvailability(
            reportable.filter((item) => item.sourceType === 'PLATFORM_MEETING')
              .length,
            confidenceItems.length,
            false,
          ),
          items: confidenceItems.map((item) => ({
            meetingId: item.id,
            value: item.aiConfidence,
            scale: '0_TO_1',
          })),
          source: 'AI_SOURCE_ANALYSIS_OVERALL_CONFIDENCE',
          isEstimated: false,
          ...(confidenceItems.length
            ? {}
            : { reason: 'NO_ANALYZED_MEETING_CONFIDENCE_AVAILABLE' }),
        },
      },
      automation: {
        notesGenerated: operations.notesGenerated,
        actionItemsCreated: operations.actionItemsCreated,
        tasksAssigned: operations.tasksAssigned,
        followUpEmailsSent: {
          availability: 'AVAILABLE',
          value: operations.followUpEmailsSent,
          source: 'SENT_EMAIL_DRAFTS_WITH_MEETING_SOURCE',
          isEstimated: false,
        },
        crmRecordsUpdated: {
          availability: 'AVAILABLE',
          value: operations.meetingCrmRecordsUpdated,
          source: 'EXECUTED_MEETING_CRM_PROPOSALS',
          isEstimated: false,
        },
        customerHealthUpdated: {
          availability: 'AVAILABLE',
          value: operations.customerHealthUpdated,
          source: 'DISTINCT_CONTACT_HEALTH_SNAPSHOTS',
          isEstimated: false,
        },
      },
      aiScheduling: {
        ...this.scheduling.suggest({
          from,
          to,
          now,
          timezone: query.timezone,
          businessHours: organization.businessHours,
          busy: active,
          durationMinutes: query.suggestionDurationMinutes,
          bufferMinutes: query.bufferMinutes,
          limit: query.suggestionLimit,
        }),
      },
    };
  }

  private mergeMeetings(
    records: Awaited<ReturnType<CalendarDashboardRepository['meetings']>>,
    now: Date,
  ) {
    const unique = new Map<string, DashboardMeeting>();
    for (const meeting of records.platform) {
      const botCompleted =
        !!meeting.meetingBotId &&
        records.completedBotIds.has(String(meeting.meetingBotId));
      const status = this.platformStatus(
        String(meeting.status),
        botCompleted,
        meeting.endsAt,
        now,
      );
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
        provider: meeting.calendarProvider as CalendarProviderType,
        calendarProvider: meeting.calendarProvider as CalendarProviderType,
        calendarEventId: meeting.calendarEventId,
        meetingPlatform: String(meeting.platform),
        eventUrl: meeting.calendarEventUrl,
        joinUrl: meeting.joinUrlEncrypted
          ? decryptText(meeting.joinUrlEncrypted, this.encryptionKey)
          : undefined,
        priority: this.priorities.assess({}),
        aiConfidence: records.confidenceByMeetingId.get(String(meeting._id)),
      });
    }
    for (const event of records.calendar) {
      const key = event.providerEventId
        ? `calendar:${String(event.provider)}:${String(event.providerEventId)}`
        : `event:${String(event._id)}`;
      const prioritySource = this.prioritySource(event);
      const priority = this.priorities.assess({
        urgency: event.urgency,
        source: prioritySource,
      });
      const existing = unique.get(key);
      if (existing) {
        existing.urgency = event.urgency;
        existing.prioritySource = prioritySource;
        existing.priority = priority;
        existing.importedFromProvider = event.importedFromProvider === true;
        continue;
      }
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
        location: event.location,
        status: this.calendarStatus(String(event.status), event.endsAt, now),
        provider: event.provider as CalendarProviderType,
        calendarProvider: event.provider as CalendarProviderType,
        calendarEventId: event.providerEventId,
        eventUrl: event.providerEventUrl,
        meetingType: String(event.meetingType),
        urgency: event.urgency,
        prioritySource,
        priority,
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
    endsAt: Date,
    now: Date,
  ): DashboardStatus {
    if (status === PlatformMeetingStatus.CANCELLED) return 'CANCELLED';
    if (status === PlatformMeetingStatus.FAILED) return 'FAILED';
    if (
      status === PlatformMeetingStatus.COMPLETED ||
      botCompleted ||
      endsAt <= now
    ) {
      return 'COMPLETED';
    }
    return 'SCHEDULED';
  }

  private calendarStatus(
    status: string,
    endsAt: Date,
    now: Date,
  ): DashboardStatus {
    if (status === CalendarEventStatus.CANCELLED) return 'CANCELLED';
    if (status === CalendarEventStatus.FAILED) return 'FAILED';
    if (endsAt <= now) return 'COMPLETED';
    return 'SCHEDULED';
  }

  private prioritySource(event: {
    prioritySource?: MeetingPrioritySource;
    importedFromProvider?: boolean;
  }) {
    if (event.prioritySource) return event.prioritySource;
    if (event.importedFromProvider) return MeetingPrioritySource.IMPORTED;
    return MeetingPrioritySource.DEFAULT;
  }

  private coverageAvailability(
    total: number,
    classified: number,
    emptyIsAvailable: boolean,
  ): 'AVAILABLE' | 'PARTIAL' | 'UNAVAILABLE' {
    if (total === 0) return emptyIsAvailable ? 'AVAILABLE' : 'UNAVAILABLE';
    if (classified === 0) return 'UNAVAILABLE';
    return classified === total ? 'AVAILABLE' : 'PARTIAL';
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

  private get encryptionKey() {
    const key = this.config.getOrThrow<string>('integrations.encryptionKey');
    if (key.length < 32) {
      throw new ServiceUnavailableException(
        'INTEGRATION_ENCRYPTION_KEY must contain at least 32 characters',
      );
    }
    return key;
  }
}
