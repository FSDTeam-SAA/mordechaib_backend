import { ConfigService } from '@nestjs/config';
import { OutlookCalendarProvider } from './outlook-calendar.provider';

describe('OutlookCalendarProvider', () => {
  const originalFetch = global.fetch;
  const config = {
    get: jest.fn((key: string, fallback?: string) => {
      const values: Record<string, string> = {
        'meetingPlatforms.microsoft.clientId': 'microsoft-client-id',
        'meetingPlatforms.microsoft.clientSecret': 'microsoft-client-secret',
        'meetingPlatforms.microsoft.redirectUri':
          'https://api.example/api/v1/calendar/outlook/oauth/callback',
        'meetingPlatforms.microsoft.authority':
          'https://login.microsoftonline.com/common',
      };
      return values[key] ?? fallback;
    }),
  };
  const provider = new OutlookCalendarProvider(
    config as unknown as ConfigService,
  );

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('supports personal and organization accounts with delegated calendar scopes', () => {
    const url = new URL(provider.getAuthorizationUrl('signed-state'));

    expect(url.pathname).toBe('/common/oauth2/v2.0/authorize');
    expect(url.searchParams.get('prompt')).toBe('select_account');
    expect(url.searchParams.get('state')).toBe('signed-state');
    expect(url.searchParams.get('scope')).toContain('offline_access');
    expect(url.searchParams.get('scope')).toContain('Calendars.ReadWrite');
  });

  it('creates an Outlook event with attendees, meeting URL, and reminder', async () => {
    const fetchMock = jest.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: 'outlook-event-1',
          webLink: 'https://outlook.office.com/calendar/item/1',
        }),
        { status: 201 },
      ),
    );
    global.fetch = fetchMock as typeof fetch;

    const event = await provider.createEvent('access-token', {
      title: 'Customer review',
      description: 'Review the rollout',
      startsAt: new Date('2099-09-01T10:00:00.000Z'),
      endsAt: new Date('2099-09-01T10:30:00.000Z'),
      timezone: 'Asia/Dhaka',
      attendees: ['guest@example.com'],
      meetingUrl: 'https://meet.google.com/abc-defg-hij',
      reminderMinutesBeforeStart: 15,
    });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(url).toBe('https://graph.microsoft.com/v1.0/me/events');
    expect(body).toEqual(
      expect.objectContaining({
        subject: 'Customer review',
        location: { displayName: 'https://meet.google.com/abc-defg-hij' },
        isReminderOn: true,
        reminderMinutesBeforeStart: 15,
        attendees: [
          {
            emailAddress: { address: 'guest@example.com' },
            type: 'required',
          },
        ],
      }),
    );
    expect(event).toEqual({
      id: 'outlook-event-1',
      provider: 'OUTLOOK_CALENDAR',
      htmlUrl: 'https://outlook.office.com/calendar/item/1',
    });
  });
});
