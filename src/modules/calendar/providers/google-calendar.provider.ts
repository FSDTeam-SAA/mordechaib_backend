import {
  BadGatewayException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CalendarProviderType } from '../../../common/enums/calendar-provider.enum';
import {
  CalendarEventResult,
  CalendarProvider,
  CreateCalendarEventInput,
  SyncedCalendarEvent,
  UpdateCalendarEventInput,
} from '../../../common/types/calendar-provider.interface';

type GoogleTokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
};

type GoogleEventResponse = { id?: string; htmlLink?: string };

type GoogleEventListItem = {
  id?: string;
  status?: string;
  summary?: string;
  description?: string;
  htmlLink?: string;
  updated?: string;
  start?: { dateTime?: string; date?: string; timeZone?: string };
  end?: { dateTime?: string; date?: string; timeZone?: string };
  attendees?: Array<{ email?: string }>;
};

type GoogleEventListResponse = {
  items?: GoogleEventListItem[];
  nextPageToken?: string;
};

@Injectable()
export class GoogleCalendarProvider implements CalendarProvider {
  readonly provider = CalendarProviderType.GOOGLE_CALENDAR;

  constructor(private readonly config: ConfigService) {}

  refreshAccessToken(refreshToken: string) {
    return this.tokenRequest({
      refresh_token: refreshToken,
      client_id: this.clientId,
      client_secret: this.clientSecret,
      grant_type: 'refresh_token',
    });
  }

  async createEvent(
    accessToken: string,
    input: CreateCalendarEventInput,
  ): Promise<CalendarEventResult> {
    const event = await this.request<GoogleEventResponse>(
      'https://www.googleapis.com/calendar/v3/calendars/primary/events?sendUpdates=all',
      accessToken,
      { method: 'POST', body: JSON.stringify(this.eventBody(input)) },
    );
    if (!event.id) {
      throw new BadGatewayException(
        'Google created the calendar event without an event id',
      );
    }
    return {
      id: event.id,
      provider: this.provider,
      htmlUrl: event.htmlLink,
    };
  }

  async updateEvent(
    accessToken: string,
    eventId: string,
    input: UpdateCalendarEventInput,
  ): Promise<CalendarEventResult> {
    const event = await this.request<GoogleEventResponse>(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(eventId)}?sendUpdates=all`,
      accessToken,
      { method: 'PATCH', body: JSON.stringify(this.eventBody(input)) },
    );
    return {
      id: event.id || eventId,
      provider: this.provider,
      htmlUrl: event.htmlLink,
    };
  }

  async cancelEvent(accessToken: string, eventId: string) {
    await this.request<void>(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(eventId)}?sendUpdates=all`,
      accessToken,
      { method: 'DELETE' },
      [404, 410],
    );
  }

  async listEvents(
    accessToken: string,
    range: { from: Date; to: Date },
  ): Promise<SyncedCalendarEvent[]> {
    const items: SyncedCalendarEvent[] = [];
    let pageToken: string | undefined;
    do {
      const query = new URLSearchParams({
        timeMin: range.from.toISOString(),
        timeMax: range.to.toISOString(),
        singleEvents: 'true',
        showDeleted: 'true',
        orderBy: 'startTime',
        maxResults: '2500',
      });
      if (pageToken) query.set('pageToken', pageToken);
      const page = await this.request<GoogleEventListResponse>(
        `https://www.googleapis.com/calendar/v3/calendars/primary/events?${query.toString()}`,
        accessToken,
      );
      for (const event of page.items || []) {
        const normalized = this.syncedEvent(event);
        if (normalized) items.push(normalized);
      }
      pageToken = page.nextPageToken;
    } while (pageToken);
    return items;
  }

  private syncedEvent(event: GoogleEventListItem) {
    if (!event.id) return undefined;
    const startsAt = this.googleDate(event.start);
    const endsAt = this.googleDate(event.end);
    const cancelled = event.status === 'cancelled';
    if ((!startsAt || !endsAt || endsAt <= startsAt) && !cancelled) {
      return undefined;
    }
    return {
      id: event.id,
      title: event.summary?.trim() || '(Untitled event)',
      description: event.description,
      startsAt,
      endsAt,
      ...(startsAt && endsAt
        ? {
            startsAt,
            endsAt,
            timezone: event.start?.timeZone || event.end?.timeZone || 'UTC',
          }
        : {}),
      attendees: (event.attendees || [])
        .map((attendee) => attendee.email?.trim().toLowerCase())
        .filter((email): email is string => !!email),
      htmlUrl: event.htmlLink,
      cancelled,
      providerUpdatedAt: event.updated ? new Date(event.updated) : undefined,
    } satisfies SyncedCalendarEvent;
  }

  private googleDate(value?: { dateTime?: string; date?: string }) {
    const raw =
      value?.dateTime || (value?.date ? `${value.date}T00:00:00Z` : '');
    if (!raw) return undefined;
    const parsed = new Date(raw);
    return Number.isNaN(parsed.getTime()) ? undefined : parsed;
  }

  private eventBody(input: UpdateCalendarEventInput) {
    return {
      ...(input.title !== undefined ? { summary: input.title } : {}),
      ...(input.description !== undefined || input.meetingUrl !== undefined
        ? {
            description: this.description(input.description, input.meetingUrl),
          }
        : {}),
      ...(input.meetingUrl !== undefined
        ? { location: input.meetingUrl || '' }
        : {}),
      ...(input.startsAt
        ? {
            start: {
              dateTime: input.startsAt.toISOString(),
              timeZone: input.timezone,
            },
          }
        : {}),
      ...(input.endsAt
        ? {
            end: {
              dateTime: input.endsAt.toISOString(),
              timeZone: input.timezone,
            },
          }
        : {}),
      ...(input.attendees !== undefined
        ? { attendees: input.attendees.map((email) => ({ email })) }
        : {}),
      ...(input.reminderMinutesBeforeStart !== undefined
        ? {
            reminders: {
              useDefault: false,
              overrides:
                input.reminderMinutesBeforeStart > 0
                  ? [
                      {
                        method: 'popup',
                        minutes: input.reminderMinutesBeforeStart,
                      },
                      {
                        method: 'email',
                        minutes: input.reminderMinutesBeforeStart,
                      },
                    ]
                  : [],
            },
          }
        : {}),
    };
  }

  private description(description?: string, meetingUrl?: string) {
    return [
      description?.trim(),
      meetingUrl ? `Join meeting: ${meetingUrl}` : '',
    ]
      .filter(Boolean)
      .join('\n\n');
  }

  private async tokenRequest(parameters: Record<string, string>) {
    this.assertConfigured();
    let response: Response;
    try {
      response = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(parameters),
        signal: AbortSignal.timeout(15_000),
      });
    } catch {
      throw new ServiceUnavailableException('Google OAuth is unavailable');
    }
    const body = (await response
      .json()
      .catch(() => ({}))) as GoogleTokenResponse;
    if (!response.ok || !body.access_token) {
      throw new BadGatewayException(
        body.error_description || body.error || 'Google OAuth failed',
      );
    }
    return body;
  }

  private async request<T>(
    url: string,
    accessToken: string,
    init: RequestInit = {},
    acceptedStatuses: number[] = [],
  ): Promise<T> {
    let response: Response;
    try {
      response = await fetch(url, {
        ...init,
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/json',
          ...(init.body ? { 'Content-Type': 'application/json' } : {}),
          ...init.headers,
        },
        signal: AbortSignal.timeout(20_000),
      });
    } catch {
      throw new ServiceUnavailableException('Google Calendar is unavailable');
    }
    if (response.status === 204 || acceptedStatuses.includes(response.status)) {
      return undefined as T;
    }
    const body = (await response.json().catch(() => ({}))) as {
      error?: { message?: string };
    };
    if (!response.ok) {
      throw new BadGatewayException(
        body.error?.message ||
          `Google Calendar failed with HTTP ${response.status}`,
      );
    }
    return body as T;
  }

  private assertConfigured() {
    if (!this.clientId || !this.clientSecret) {
      throw new ServiceUnavailableException('Google OAuth is not configured');
    }
  }

  private get clientId() {
    return this.config.get<string>('meetingPlatforms.google.clientId') || '';
  }

  private get clientSecret() {
    return (
      this.config.get<string>('meetingPlatforms.google.clientSecret') || ''
    );
  }
}
