import { ConfigService } from '@nestjs/config';
import { CalendarProviderType } from '../../common/enums/calendar-provider.enum';
import { CalendarEventStatus } from '../../common/enums/calendar-event-status.enum';
import { encryptText } from '../../common/helpers/crypto.helper';
import { CalendarRepository } from './calendar.repository';
import { CalendarService } from './calendar.service';
import { GoogleCalendarProvider } from './providers/google-calendar.provider';
import { OutlookCalendarProvider } from './providers/outlook-calendar.provider';
import { CalendarEventsRepository } from './calendar-events.repository';

describe('CalendarService', () => {
  const encryptionKey = 'c'.repeat(32);
  let repository: Record<string, jest.Mock>;
  let google: Record<string, jest.Mock>;
  let outlook: Record<string, jest.Mock>;
  let events: Record<string, jest.Mock>;
  let service: CalendarService;

  beforeEach(() => {
    repository = {
      list: jest.fn(),
      findConnected: jest.fn(),
      findDefaultConnected: jest.fn(),
      setDefault: jest.fn(),
      upsert: jest.fn(),
    };
    google = {
      refreshAccessToken: jest.fn(),
      createEvent: jest.fn(),
      updateEvent: jest.fn(),
      cancelEvent: jest.fn(),
    };
    outlook = {
      refreshAccessToken: jest.fn(),
      createEvent: jest.fn(),
      updateEvent: jest.fn(),
      cancelEvent: jest.fn(),
    };
    events = {
      reserve: jest.fn(),
      findById: jest.fn(),
      update: jest.fn(),
      list: jest.fn(),
    };
    const config = {
      get: jest.fn((_key: string, fallback?: unknown) => fallback),
      getOrThrow: jest.fn().mockReturnValue(encryptionKey),
    };
    service = new CalendarService(
      repository as unknown as CalendarRepository,
      google as unknown as GoogleCalendarProvider,
      outlook as unknown as OutlookCalendarProvider,
      config as unknown as ConfigService,
      events as unknown as CalendarEventsRepository,
    );
  });

  it('refreshes an expired Outlook token and creates the event with the new token', async () => {
    repository.findConnected.mockResolvedValue({
      provider: CalendarProviderType.OUTLOOK_CALENDAR,
      status: 'CONNECTED',
      accessToken: encryptText('expired-access', encryptionKey),
      refreshToken: encryptText('outlook-refresh', encryptionKey),
      expiresAt: new Date(Date.now() - 60_000),
    });
    outlook.refreshAccessToken.mockResolvedValue({
      access_token: 'new-outlook-access',
      refresh_token: 'rotated-outlook-refresh',
      expires_in: 3600,
    });
    outlook.createEvent.mockResolvedValue({
      id: 'event-1',
      provider: CalendarProviderType.OUTLOOK_CALENDAR,
    });

    await service.createMeetingEvent(
      'org-1',
      {
        title: 'Review',
        startsAt: new Date('2099-09-01T10:00:00.000Z'),
        endsAt: new Date('2099-09-01T10:30:00.000Z'),
        timezone: 'Asia/Dhaka',
        attendees: [],
        reminderMinutesBeforeStart: 15,
      },
      CalendarProviderType.OUTLOOK_CALENDAR,
    );

    expect(outlook.refreshAccessToken).toHaveBeenCalledWith('outlook-refresh');
    expect(outlook.createEvent).toHaveBeenCalledWith(
      'new-outlook-access',
      expect.objectContaining({ title: 'Review' }),
    );
    expect(repository.upsert).toHaveBeenCalledWith(
      'org-1',
      CalendarProviderType.OUTLOOK_CALENDAR,
      expect.objectContaining({ status: 'CONNECTED' }),
    );
  });

  it('creates and locally tracks an event in the default calendar', async () => {
    const connection = {
      provider: CalendarProviderType.GOOGLE_CALENDAR,
      status: 'CONNECTED',
      accessToken: encryptText('google-access', encryptionKey),
      refreshToken: encryptText('google-refresh', encryptionKey),
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      isDefaultCalendar: true,
    };
    const reserved = {
      _id: '66cc9bdfa847ea856c7b41d2',
      organizationId: 'org-1',
      createdByUserId: 'user-1',
      provider: CalendarProviderType.GOOGLE_CALENDAR,
      title: 'Planning',
      startsAt: new Date('2099-09-01T10:00:00.000Z'),
      endsAt: new Date('2099-09-01T10:30:00.000Z'),
      timezone: 'Asia/Dhaka',
      attendees: [],
      reminderMinutesBeforeStart: 15,
      status: CalendarEventStatus.CREATING,
    };
    repository.findDefaultConnected.mockResolvedValue(connection);
    repository.findConnected.mockResolvedValue(connection);
    events.reserve.mockResolvedValue({ event: reserved, created: true });
    events.update.mockImplementation(
      async (_id: string, _organizationId: string, input: object) => ({
        ...reserved,
        ...input,
      }),
    );
    google.createEvent.mockResolvedValue({
      id: 'google-event-1',
      provider: CalendarProviderType.GOOGLE_CALENDAR,
      htmlUrl: 'https://calendar.google.com/event/1',
    });

    const result = await service.createEvent('org-1', 'user-1', {
      title: 'Planning',
      startTime: '2099-09-01T10:00:00.000Z',
      endTime: '2099-09-01T10:30:00.000Z',
      timezone: 'Asia/Dhaka',
      idempotencyKey: 'planning-1',
    });

    expect(events.reserve).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'org-1',
        createdByUserId: 'user-1',
        provider: CalendarProviderType.GOOGLE_CALENDAR,
      }),
    );
    expect(google.createEvent).toHaveBeenCalledWith(
      'google-access',
      expect.objectContaining({ title: 'Planning' }),
    );
    expect(result).toEqual(
      expect.objectContaining({
        id: '66cc9bdfa847ea856c7b41d2',
        providerEventId: 'google-event-1',
        status: CalendarEventStatus.SCHEDULED,
        duplicate: false,
      }),
    );
  });

  it('returns organization calendar events without internal persistence fields', async () => {
    events.list.mockResolvedValue({
      items: [
        {
          _id: '66cc9bdfa847ea856c7b41d2',
          __v: 0,
          idempotencyHash: 'private-hash',
          organizationId: 'org-1',
          provider: CalendarProviderType.OUTLOOK_CALENDAR,
          title: 'Review',
          startsAt: new Date('2099-09-01T10:00:00.000Z'),
          endsAt: new Date('2099-09-01T10:30:00.000Z'),
          timezone: 'Asia/Dhaka',
          attendees: [],
          reminderMinutesBeforeStart: 15,
          status: CalendarEventStatus.SCHEDULED,
        },
      ],
      total: 1,
      page: 1,
      limit: 20,
      pages: 1,
    });

    const result = await service.listEvents('org-1', {
      page: 1,
      limit: 20,
    });

    expect(events.list).toHaveBeenCalledWith('org-1', 1, 20, {
      provider: undefined,
      status: undefined,
      from: undefined,
      to: undefined,
    });
    expect(result.items[0]).toEqual(
      expect.objectContaining({
        id: '66cc9bdfa847ea856c7b41d2',
        title: 'Review',
      }),
    );
    expect(result.items[0]).not.toHaveProperty('_id');
    expect(result.items[0]).not.toHaveProperty('__v');
    expect(result.items[0]).not.toHaveProperty('idempotencyHash');
  });
});
