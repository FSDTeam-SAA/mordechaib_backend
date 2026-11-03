import { CalendarEventStatus } from '../../common/enums/calendar-event-status.enum';
import { CalendarProviderType } from '../../common/enums/calendar-provider.enum';
import { MeetingPlatform } from '../../common/enums/meeting-platform.enum';
import { MeetingType } from '../../common/enums/meeting-type.enum';
import { MeetingUrgency } from '../../common/enums/meeting-urgency.enum';
import { PlatformMeetingStatus } from '../../common/enums/platform-meeting-status.enum';
import { encryptText } from '../../common/helpers/crypto.helper';
import { CalendarDashboardRepository } from './calendar-dashboard.repository';
import { CalendarDashboardService } from './calendar-dashboard.service';
import { CalendarService } from './calendar.service';

describe('CalendarDashboardService', () => {
  const encryptionKey = 'calendar-dashboard-test-key-32chars';
  const repository = {
    meetings: jest.fn(),
    operationalMetrics: jest.fn(),
  };
  const config = {
    getOrThrow: jest.fn(() => encryptionKey),
  };
  const calendars = {
    getDefaultProvider: jest.fn(),
  };
  const service = new CalendarDashboardService(
    repository as unknown as CalendarDashboardRepository,
    config as unknown as ConfigService,
    calendars as unknown as CalendarService,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    calendars.getDefaultProvider.mockResolvedValue(
      CalendarProviderType.GOOGLE_CALENDAR,
    );
    repository.operationalMetrics.mockResolvedValue({
      tasksFromCalls: 2,
      upcomingDeadlines: 3,
      aiReminders: 1,
      notesGenerated: 4,
      actionItemsCreated: 5,
      tasksAssigned: 2,
    });
  });

  it('deduplicates provider events and derives completion from the meeting bot', async () => {
    repository.meetings.mockResolvedValue({
      platform: [
        {
          _id: 'platform-1',
          title: 'Client review',
          startsAt: new Date('2026-09-26T10:00:00.000Z'),
          endsAt: new Date('2026-09-26T10:30:00.000Z'),
          durationMinutes: 30,
          timezone: 'UTC',
          invitees: ['client@example.com'],
          status: PlatformMeetingStatus.SCHEDULED,
          platform: MeetingPlatform.GOOGLE_MEET,
          calendarProvider: CalendarProviderType.GOOGLE_CALENDAR,
          calendarEventId: 'google-event-1',
          meetingBotId: 'bot-1',
          joinUrlEncrypted: encryptText(
            'https://meet.google.com/abc-defg-hij',
            encryptionKey,
          ),
        },
      ],
      truncated: false,
      calendar: [
        {
          _id: 'calendar-1',
          title: 'Client review',
          startsAt: new Date('2026-09-26T10:00:00.000Z'),
          endsAt: new Date('2026-09-26T10:30:00.000Z'),
          timezone: 'UTC',
          attendees: ['client@example.com'],
          status: CalendarEventStatus.SCHEDULED,
          provider: CalendarProviderType.GOOGLE_CALENDAR,
          providerEventId: 'google-event-1',
          meetingType: MeetingType.GOOGLE_MEET,
          urgency: MeetingUrgency.HIGH,
        },
      ],
      completedBotIds: new Set(['bot-1']),
    });

    const result = await service.get(
      'org-1',
      {
        from: '2026-09-01T00:00:00.000Z',
        to: '2026-10-01T00:00:00.000Z',
        timezone: 'UTC',
        bufferMinutes: 15,
        upcomingLimit: 8,
        conflictLimit: 20,
      },
      new Date('2026-09-25T00:00:00.000Z'),
    );

    expect(result.items).toHaveLength(1);
    expect(repository.meetings).toHaveBeenCalledWith(
      'org-1',
      CalendarProviderType.GOOGLE_CALENDAR,
      new Date('2026-09-01T00:00:00.000Z'),
      new Date('2026-10-01T00:00:00.000Z'),
    );
    expect(result.calendarProvider).toBe(CalendarProviderType.GOOGLE_CALENDAR);
    expect(result.items[0]).toEqual(
      expect.objectContaining({
        provider: CalendarProviderType.GOOGLE_CALENDAR,
        calendarProvider: CalendarProviderType.GOOGLE_CALENDAR,
        calendarEventId: 'google-event-1',
        meetingPlatform: MeetingPlatform.GOOGLE_MEET,
      }),
    );
    expect(result.items[0].joinUrl).toBe(
      'https://meet.google.com/abc-defg-hij',
    );
    expect(result.summary).toEqual(
      expect.objectContaining({ total: 1, completed: 1, scheduled: 0 }),
    );
    expect(result.taskAndCalls.crmUpdatesToday).toEqual(
      expect.objectContaining({ availability: 'UNAVAILABLE' }),
    );
  });
});
import { ConfigService } from '@nestjs/config';
