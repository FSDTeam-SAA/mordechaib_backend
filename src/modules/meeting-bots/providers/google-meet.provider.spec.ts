import { ConfigService } from '@nestjs/config';
import { GoogleMeetProvider } from './google-meet.provider';

describe('GoogleMeetProvider', () => {
  const originalFetch = global.fetch;
  const config = {
    get: jest.fn((key: string) => {
      const values: Record<string, string> = {
        'meetingPlatforms.google.clientId': 'google-client-id',
        'meetingPlatforms.google.clientSecret': 'google-client-secret',
        'meetingPlatforms.google.redirectUri':
          'https://api.example/api/v1/google-meetings/oauth/callback',
      };
      return values[key];
    }),
  };
  const provider = new GoogleMeetProvider(config as unknown as ConfigService);

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('builds an offline OAuth URL with the calendar event scope', () => {
    const url = new URL(provider.getAuthorizationUrl('signed-state'));

    expect(url.searchParams.get('access_type')).toBe('offline');
    expect(url.searchParams.get('prompt')).toBe('consent');
    expect(url.searchParams.get('state')).toBe('signed-state');
    expect(url.searchParams.get('scope')).toContain(
      'https://www.googleapis.com/auth/calendar.events',
    );
    expect(url.searchParams.get('scope')).toContain(
      'https://www.googleapis.com/auth/meetings.space.created',
    );
  });

  it('creates a standalone Meet space without a Google calendar event', async () => {
    const fetchMock = jest.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          name: 'spaces/abc-defg-hij',
          meetingUri: 'https://meet.google.com/abc-defg-hij',
          meetingCode: 'abc-defg-hij',
        }),
        { status: 200 },
      ),
    );
    global.fetch = fetchMock as typeof fetch;

    const meeting = await provider.createStandaloneMeeting('access-token');

    expect(fetchMock).toHaveBeenCalledWith(
      'https://meet.googleapis.com/v2/spaces',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(meeting).toEqual(
      expect.objectContaining({
        providerMeetingId: 'spaces/abc-defg-hij',
        joinUrl: 'https://meet.google.com/abc-defg-hij',
        metadata: expect.objectContaining({
          googleMeetingMode: 'STANDALONE_SPACE',
        }),
      }),
    );
  });

  it('creates an event and waits for its asynchronous Meet link', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: 'event-1',
            conferenceData: {
              createRequest: { status: { statusCode: 'pending' } },
            },
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: 'event-1',
            htmlLink: 'https://calendar.google.com/event?eid=event-1',
            hangoutLink: 'https://meet.google.com/abc-defg-hij',
          }),
          { status: 200 },
        ),
      );
    global.fetch = fetchMock as typeof fetch;

    const meeting = await provider.createMeeting('access-token', {
      title: 'Project review',
      startsAt: new Date('2026-09-01T10:00:00.000Z'),
      durationMinutes: 30,
      timezone: 'Asia/Dhaka',
      invitees: ['guest@example.com'],
      immediate: false,
      reminderMinutesBeforeStart: 15,
    });

    const [insertUrl, insertInit] = fetchMock.mock.calls[0] as [
      string,
      RequestInit,
    ];
    const body = JSON.parse(String(insertInit.body)) as Record<string, unknown>;
    expect(insertUrl).toContain('conferenceDataVersion=1');
    expect(body).toEqual(
      expect.objectContaining({
        summary: 'Project review',
        attendees: [{ email: 'guest@example.com' }],
        conferenceData: {
          createRequest: {
            requestId: expect.any(String),
            conferenceSolutionKey: { type: 'hangoutsMeet' },
          },
        },
      }),
    );
    expect(fetchMock.mock.calls[1][0]).toContain('/events/event-1');
    expect(meeting).toEqual({
      providerMeetingId: 'event-1',
      joinUrl: 'https://meet.google.com/abc-defg-hij',
      startUrl: 'https://meet.google.com/abc-defg-hij',
      metadata: {
        googleMeetingMode: 'CALENDAR_EVENT',
        calendarEventUrl: 'https://calendar.google.com/event?eid=event-1',
      },
    });
  });
});
