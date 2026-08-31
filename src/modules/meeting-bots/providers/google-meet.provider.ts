import {
  BadGatewayException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import crypto from 'crypto';
import {
  CreatedProviderMeeting,
  CreateProviderMeetingInput,
} from './platform-meeting-provider.types';

type GoogleTokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
  error?: string;
  error_description?: string;
};

export type GoogleProfile = {
  sub: string;
  email: string;
  name?: string;
  picture?: string;
};

type GoogleCalendarEvent = {
  id?: string;
  htmlLink?: string;
  hangoutLink?: string;
  conferenceData?: {
    entryPoints?: Array<{ entryPointType?: string; uri?: string }>;
    createRequest?: { status?: { statusCode?: string } };
  };
};

@Injectable()
export class GoogleMeetProvider {
  constructor(private readonly config: ConfigService) {}

  getAuthorizationUrl(state: string) {
    this.assertConfigured();
    const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    url.search = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      response_type: 'code',
      access_type: 'offline',
      prompt: 'consent',
      include_granted_scopes: 'true',
      state,
      scope: [
        'openid',
        'email',
        'profile',
        'https://www.googleapis.com/auth/calendar.events',
      ].join(' '),
    }).toString();
    return url.toString();
  }

  exchangeCode(code: string) {
    return this.tokenRequest({
      code,
      client_id: this.clientId,
      client_secret: this.clientSecret,
      redirect_uri: this.redirectUri,
      grant_type: 'authorization_code',
    });
  }

  refreshAccessToken(refreshToken: string) {
    return this.tokenRequest({
      refresh_token: refreshToken,
      client_id: this.clientId,
      client_secret: this.clientSecret,
      grant_type: 'refresh_token',
    });
  }

  async getProfile(accessToken: string) {
    return this.request<GoogleProfile>(
      'https://openidconnect.googleapis.com/v1/userinfo',
      accessToken,
    );
  }

  async createMeeting(
    accessToken: string,
    input: CreateProviderMeetingInput,
  ): Promise<CreatedProviderMeeting> {
    const endsAt = new Date(
      input.startsAt.getTime() + input.durationMinutes * 60_000,
    );
    const event = await this.request<GoogleCalendarEvent>(
      'https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=1&sendUpdates=all',
      accessToken,
      {
        method: 'POST',
        body: JSON.stringify({
          summary: input.title,
          ...(input.agenda ? { description: input.agenda } : {}),
          start: {
            dateTime: input.startsAt.toISOString(),
            timeZone: input.timezone,
          },
          end: { dateTime: endsAt.toISOString(), timeZone: input.timezone },
          ...(input.invitees.length
            ? {
                attendees: input.invitees.map((email) => ({ email })),
              }
            : {}),
          conferenceData: {
            createRequest: {
              requestId: crypto.randomUUID(),
              conferenceSolutionKey: { type: 'hangoutsMeet' },
            },
          },
        }),
      },
    );
    if (!event.id) {
      throw new BadGatewayException(
        'Google created the calendar event without an event id',
      );
    }
    const completedEvent = await this.waitForConference(accessToken, event);
    const joinUrl = this.meetUrl(completedEvent);
    if (!joinUrl) {
      await this.deleteMeeting(accessToken, event.id).catch(() => undefined);
      throw new BadGatewayException(
        'Google created the calendar event without a Google Meet link',
      );
    }
    return {
      providerMeetingId: event.id,
      joinUrl,
      startUrl: joinUrl,
      metadata: { calendarEventUrl: completedEvent.htmlLink || event.htmlLink },
    };
  }

  async deleteMeeting(accessToken: string, eventId: string) {
    await this.request<void>(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(eventId)}?sendUpdates=all`,
      accessToken,
      { method: 'DELETE' },
    );
  }

  async revokeToken(token: string) {
    const response = await fetch(
      `https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        signal: AbortSignal.timeout(10_000),
      },
    );
    if (!response.ok && response.status !== 400) {
      throw new BadGatewayException('Google token revocation failed');
    }
  }

  private async waitForConference(
    accessToken: string,
    initial: GoogleCalendarEvent,
  ) {
    if (this.meetUrl(initial)) return initial;
    let event = initial;
    for (let attempt = 0; attempt < 8; attempt += 1) {
      if (
        event.conferenceData?.createRequest?.status?.statusCode === 'failure'
      ) {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
      event = await this.request<GoogleCalendarEvent>(
        `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(initial.id!)}?conferenceDataVersion=1`,
        accessToken,
      );
      if (this.meetUrl(event)) return event;
    }
    return event;
  }

  private meetUrl(event: GoogleCalendarEvent) {
    return (
      event.hangoutLink ||
      event.conferenceData?.entryPoints?.find(
        (entry) => entry.entryPointType === 'video',
      )?.uri
    );
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
      throw new ServiceUnavailableException('Google API is unavailable');
    }
    if (response.status === 204) return undefined as T;
    const body = (await response.json().catch(() => ({}))) as {
      error?: { message?: string };
    };
    if (!response.ok) {
      throw new BadGatewayException(
        body.error?.message || `Google API failed with HTTP ${response.status}`,
      );
    }
    return body as T;
  }

  private assertConfigured() {
    if (!this.clientId || !this.clientSecret || !this.redirectUri) {
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

  private get redirectUri() {
    return this.config.get<string>('meetingPlatforms.google.redirectUri') || '';
  }
}
