import { ConfigService } from '@nestjs/config';
import { RecallApiClient } from './recall-api.client';
import { RecallZoomAuthProvider } from './recall-zoom-auth.provider';

describe('RecallZoomAuthProvider meeting API', () => {
  const originalFetch = global.fetch;
  const client = {
    parseResponseBody: jest.fn(),
  };
  const provider = new RecallZoomAuthProvider(
    { get: jest.fn() } as unknown as ConfigService,
    client as unknown as RecallApiClient,
  );

  afterEach(() => {
    global.fetch = originalFetch;
    jest.clearAllMocks();
  });

  it('creates a scheduled meeting for the connected Zoom user', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue(new Response(null, { status: 201 }));
    client.parseResponseBody.mockResolvedValue({
      id: 123456789,
      uuid: 'zoom-uuid',
      join_url: 'https://zoom.us/j/123456789?pwd=secret',
      start_url: 'https://zoom.us/s/123456789?zak=short-lived',
      password: 'secret',
    });

    const meeting = await provider.createMeeting('zoom-access-token', {
      title: 'Zoom project review',
      agenda: 'Review progress',
      startsAt: new Date('2099-09-01T10:00:00.000Z'),
      durationMinutes: 30,
      timezone: 'Asia/Dhaka',
      invitees: ['guest@example.com'],
      immediate: false,
      reminderMinutesBeforeStart: 15,
    });

    const fetchMock = global.fetch as jest.Mock;
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(url).toBe('https://api.zoom.us/v2/users/me/meetings');
    expect(init.headers).toEqual(
      expect.objectContaining({ Authorization: 'Bearer zoom-access-token' }),
    );
    expect(body).toEqual(
      expect.objectContaining({
        topic: 'Zoom project review',
        type: 2,
        duration: 30,
        timezone: 'Asia/Dhaka',
        settings: { meeting_invitees: [{ email: 'guest@example.com' }] },
      }),
    );
    expect(meeting.metadata).toEqual({ uuid: 'zoom-uuid' });
    expect(meeting.metadata).not.toHaveProperty('password');
  });
});
