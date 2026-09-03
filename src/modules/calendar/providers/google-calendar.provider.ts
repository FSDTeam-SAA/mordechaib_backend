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
