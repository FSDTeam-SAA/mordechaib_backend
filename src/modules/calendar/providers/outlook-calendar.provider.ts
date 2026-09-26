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

type MicrosoftTokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  error?: string;
  error_description?: string;
};

export type MicrosoftProfile = {
  id: string;
  displayName?: string;
  mail?: string;
  userPrincipalName?: string;
};

type OutlookEventResponse = { id?: string; webLink?: string };

type OutlookEventListItem = {
  id?: string;
  subject?: string;
  bodyPreview?: string;
  webLink?: string;
  isCancelled?: boolean;
  lastModifiedDateTime?: string;
  start?: { dateTime?: string; timeZone?: string };
  end?: { dateTime?: string; timeZone?: string };
  attendees?: Array<{ emailAddress?: { address?: string } }>;
};

type OutlookEventListResponse = {
  value?: OutlookEventListItem[];
  '@odata.nextLink'?: string;
};

@Injectable()
export class OutlookCalendarProvider implements CalendarProvider {
  readonly provider = CalendarProviderType.OUTLOOK_CALENDAR;

  constructor(private readonly config: ConfigService) {}

  getAuthorizationUrl(state: string) {
    this.assertConfigured();
    const url = new URL(`${this.authority}/oauth2/v2.0/authorize`);
    url.search = new URLSearchParams({
      client_id: this.clientId,
      response_type: 'code',
      redirect_uri: this.redirectUri,
      response_mode: 'query',
      prompt: 'select_account',
      state,
      scope: [
        'openid',
        'profile',
        'email',
        'offline_access',
        'User.Read',
        'Calendars.ReadWrite',
      ].join(' '),
    }).toString();
    return url.toString();
  }

  exchangeCode(code: string) {
    return this.tokenRequest({
      client_id: this.clientId,
      client_secret: this.clientSecret,
      code,
      redirect_uri: this.redirectUri,
      grant_type: 'authorization_code',
      scope: this.scopes,
    });
  }

  refreshAccessToken(refreshToken: string) {
    return this.tokenRequest({
      client_id: this.clientId,
      client_secret: this.clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
      scope: this.scopes,
    });
  }

  getProfile(accessToken: string) {
    return this.request<MicrosoftProfile>(
      'https://graph.microsoft.com/v1.0/me?$select=id,displayName,mail,userPrincipalName',
      accessToken,
    );
  }

  async createEvent(
    accessToken: string,
    input: CreateCalendarEventInput,
  ): Promise<CalendarEventResult> {
    const event = await this.request<OutlookEventResponse>(
      'https://graph.microsoft.com/v1.0/me/events',
      accessToken,
      { method: 'POST', body: JSON.stringify(this.eventBody(input)) },
    );
    if (!event.id) {
      throw new BadGatewayException(
        'Outlook created the calendar event without an event id',
      );
    }
    return {
      id: event.id,
      provider: this.provider,
      htmlUrl: event.webLink,
    };
  }

  async updateEvent(
    accessToken: string,
    eventId: string,
    input: UpdateCalendarEventInput,
  ): Promise<CalendarEventResult> {
    const event = await this.request<OutlookEventResponse>(
      `https://graph.microsoft.com/v1.0/me/events/${encodeURIComponent(eventId)}`,
      accessToken,
      { method: 'PATCH', body: JSON.stringify(this.eventBody(input)) },
    );
    return {
      id: event.id || eventId,
      provider: this.provider,
      htmlUrl: event.webLink,
    };
  }

  async cancelEvent(accessToken: string, eventId: string) {
    await this.request<void>(
      `https://graph.microsoft.com/v1.0/me/events/${encodeURIComponent(eventId)}`,
      accessToken,
      { method: 'DELETE' },
      [404, 410],
    );
  }

  async listEvents(
    accessToken: string,
    range: { from: Date; to: Date },
  ): Promise<SyncedCalendarEvent[]> {
    const query = new URLSearchParams({
      startDateTime: range.from.toISOString(),
      endDateTime: range.to.toISOString(),
      $top: '1000',
      $select:
        'id,subject,bodyPreview,start,end,attendees,webLink,isCancelled,lastModifiedDateTime',
    });
    let nextUrl: string | undefined =
      `https://graph.microsoft.com/v1.0/me/calendarView?${query.toString()}`;
    const items: SyncedCalendarEvent[] = [];
    while (nextUrl) {
      const page: OutlookEventListResponse =
        await this.request<OutlookEventListResponse>(nextUrl, accessToken, {
          headers: { Prefer: 'outlook.timezone="UTC"' },
        });
      for (const event of page.value || []) {
        const normalized = this.syncedEvent(event);
        if (normalized) items.push(normalized);
      }
      nextUrl = page['@odata.nextLink'];
    }
    return items;
  }

  private syncedEvent(event: OutlookEventListItem) {
    if (!event.id) return undefined;
    const startsAt = this.microsoftDate(event.start?.dateTime);
    const endsAt = this.microsoftDate(event.end?.dateTime);
    const cancelled = event.isCancelled === true;
    if ((!startsAt || !endsAt || endsAt <= startsAt) && !cancelled) {
      return undefined;
    }
    return {
      id: event.id,
      title: event.subject?.trim() || '(Untitled event)',
      description: event.bodyPreview,
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
        .map((attendee) => attendee.emailAddress?.address?.trim().toLowerCase())
        .filter((email): email is string => !!email),
      htmlUrl: event.webLink,
      cancelled,
      providerUpdatedAt: event.lastModifiedDateTime
        ? new Date(event.lastModifiedDateTime)
        : undefined,
    } satisfies SyncedCalendarEvent;
  }

  private microsoftDate(value?: string) {
    if (!value) return undefined;
    const normalized = /(?:Z|[+-]\d{2}:\d{2})$/.test(value)
      ? value
      : `${value}Z`;
    const parsed = new Date(normalized);
    return Number.isNaN(parsed.getTime()) ? undefined : parsed;
  }

  private eventBody(input: UpdateCalendarEventInput) {
    return {
      ...(input.title !== undefined ? { subject: input.title } : {}),
      ...(input.description !== undefined || input.meetingUrl !== undefined
        ? {
            body: {
              contentType: 'text',
              content: this.description(input.description, input.meetingUrl),
            },
          }
        : {}),
      ...(input.meetingUrl !== undefined
        ? { location: { displayName: input.meetingUrl || '' } }
        : {}),
      ...(input.startsAt
        ? {
            start: {
              dateTime: this.utcDateTime(input.startsAt),
              timeZone: 'UTC',
            },
          }
        : {}),
      ...(input.endsAt
        ? {
            end: {
              dateTime: this.utcDateTime(input.endsAt),
              timeZone: 'UTC',
            },
          }
        : {}),
      ...(input.attendees !== undefined
        ? {
            attendees: input.attendees.map((address) => ({
              emailAddress: { address },
              type: 'required',
            })),
          }
        : {}),
      ...(input.reminderMinutesBeforeStart !== undefined
        ? {
            isReminderOn: input.reminderMinutesBeforeStart > 0,
            reminderMinutesBeforeStart: input.reminderMinutesBeforeStart,
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

  private utcDateTime(value: Date) {
    return value.toISOString().replace(/Z$/, '');
  }

  private async tokenRequest(parameters: Record<string, string>) {
    this.assertConfigured();
    let response: Response;
    try {
      response = await fetch(`${this.authority}/oauth2/v2.0/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(parameters),
        signal: AbortSignal.timeout(15_000),
      });
    } catch {
      throw new ServiceUnavailableException('Microsoft OAuth is unavailable');
    }
    const body = (await response
      .json()
      .catch(() => ({}))) as MicrosoftTokenResponse;
    if (!response.ok || !body.access_token) {
      throw new BadGatewayException(
        body.error_description || body.error || 'Microsoft OAuth failed',
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
      throw new ServiceUnavailableException('Microsoft Graph is unavailable');
    }
    if (response.status === 204 || acceptedStatuses.includes(response.status)) {
      return undefined as T;
    }
    const body = (await response.json().catch(() => ({}))) as {
      error?: { message?: string; code?: string };
    };
    if (!response.ok) {
      throw new BadGatewayException(
        body.error?.message ||
          body.error?.code ||
          `Microsoft Graph failed with HTTP ${response.status}`,
      );
    }
    return body as T;
  }

  private assertConfigured() {
    if (!this.clientId || !this.clientSecret || !this.redirectUri) {
      throw new ServiceUnavailableException(
        'Microsoft Outlook OAuth is not configured',
      );
    }
  }

  private get clientId() {
    return this.config.get<string>('meetingPlatforms.microsoft.clientId') || '';
  }

  private get clientSecret() {
    return (
      this.config.get<string>('meetingPlatforms.microsoft.clientSecret') || ''
    );
  }

  private get redirectUri() {
    return (
      this.config.get<string>('meetingPlatforms.microsoft.redirectUri') || ''
    );
  }

  private get authority() {
    return this.config.get<string>(
      'meetingPlatforms.microsoft.authority',
      'https://login.microsoftonline.com/common',
    );
  }

  private get scopes() {
    return 'openid profile email offline_access User.Read Calendars.ReadWrite';
  }
}
