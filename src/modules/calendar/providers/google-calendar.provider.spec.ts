import { ConfigService } from '@nestjs/config';
import { GoogleCalendarProvider } from './google-calendar.provider';

describe('GoogleCalendarProvider', () => {
  const originalFetch = global.fetch;
  const provider = new GoogleCalendarProvider({
    get: jest.fn((key: string) =>
      key.endsWith('clientId') ? 'google-client-id' : 'google-client-secret',
    ),
  } as unknown as ConfigService);

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('normalizes paginated Google Calendar events for synchronization', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            items: [
              {
                id: 'google-event-1',
                summary: 'Review',
                start: { dateTime: '2026-09-26T10:00:00Z', timeZone: 'UTC' },
                end: { dateTime: '2026-09-26T10:30:00Z', timeZone: 'UTC' },
                attendees: [{ email: 'Guest@Example.com' }],
              },
            ],
            nextPageToken: 'next-page',
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            items: [{ id: 'deleted-event', status: 'cancelled' }],
          }),
          { status: 200 },
        ),
      );
    global.fetch = fetchMock as typeof fetch;

    const items = await provider.listEvents('access-token', {
      from: new Date('2026-09-01T00:00:00.000Z'),
      to: new Date('2026-10-01T00:00:00.000Z'),
    });

    expect(items).toEqual([
      expect.objectContaining({
        id: 'google-event-1',
        attendees: ['guest@example.com'],
        cancelled: false,
      }),
      expect.objectContaining({ id: 'deleted-event', cancelled: true }),
    ]);
    expect(String(fetchMock.mock.calls[1][0])).toContain('pageToken=next-page');
  });
});
