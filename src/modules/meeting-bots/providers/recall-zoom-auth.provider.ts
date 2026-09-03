import {
  BadGatewayException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RecallApiClient } from './recall-api.client';
import { RecallApiError } from './recall.types';
import {
  CreatedProviderMeeting,
  CreateProviderMeetingInput,
  UpdateProviderMeetingInput,
} from './platform-meeting-provider.types';

@Injectable()
export class RecallZoomAuthProvider {
  constructor(
    private readonly config: ConfigService,
    private readonly client: RecallApiClient,
  ) {}

  getAuthorizationUrl(state: string) {
    const clientId = this.config.get<string>('recall.zoom.clientId');
    const redirectUri = this.config.get<string>('recall.zoom.redirectUri');
    if (!clientId || !redirectUri) {
      throw new ServiceUnavailableException(
        'Zoom OAuth credentials are not configured',
      );
    }
    const url = new URL('https://zoom.us/oauth/authorize');
    url.search = new URLSearchParams({
      response_type: 'code',
      client_id: clientId,
      redirect_uri: redirectUri,
      state,
    }).toString();
    return url.toString();
  }

  createCredential(code: string) {
    const oauthAppId = this.config.get<string>('recall.zoom.oauthAppId');
    const redirectUri = this.config.get<string>('recall.zoom.redirectUri');
    if (!oauthAppId || !redirectUri) {
      throw new ServiceUnavailableException(
        'Recall Zoom OAuth app is not configured',
      );
    }
    return this.client.request<{ id: string; [key: string]: unknown }>(
      '/api/v2/zoom-oauth-credentials/',
      {
        method: 'POST',
        body: JSON.stringify({
          oauth_app: oauthAppId,
          authorization_code: { code, redirect_uri: redirectUri },
        }),
      },
    );
  }

  async getAccessToken(credentialId: string) {
    const response = await this.client.request<{
      access_token?: string;
      token?: string;
    }>(
      `/api/v2/zoom-oauth-credentials/${encodeURIComponent(credentialId)}/access-token/`,
      {},
      7_000,
    );
    const accessToken = response.access_token ?? response.token;
    if (!accessToken) {
      throw new RecallApiError(
        'Recall Zoom credential did not return an access token',
        502,
      );
    }
    return accessToken;
  }

  deleteCredential(credentialId: string) {
    return this.client.request<void>(
      `/api/v2/zoom-oauth-credentials/${encodeURIComponent(credentialId)}/`,
      { method: 'DELETE' },
    );
  }

  async getZakToken(credentialId: string) {
    const accessToken = await this.getAccessToken(credentialId);

    const response = await fetch('https://api.zoom.us/v2/users/me/zak', {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(7_000),
    });
    const body = (await this.client.parseResponseBody(response)) as {
      token?: string;
      message?: string;
    };
    if (!response.ok || !body?.token) {
      throw new RecallApiError(
        body?.message || `Zoom ZAK request failed with HTTP ${response.status}`,
        response.status,
      );
    }
    return body.token;
  }

  getCurrentUser(accessToken: string) {
    return this.zoomRequest<{
      id: string;
      email: string;
      first_name?: string;
      last_name?: string;
      display_name?: string;
    }>('/users/me', accessToken);
  }

  async createMeeting(
    accessToken: string,
    input: CreateProviderMeetingInput,
  ): Promise<CreatedProviderMeeting> {
    const meeting = await this.zoomRequest<{
      id?: string | number;
      uuid?: string;
      join_url?: string;
      start_url?: string;
      password?: string;
    }>('/users/me/meetings', accessToken, {
      method: 'POST',
      body: JSON.stringify({
        topic: input.title,
        type: input.immediate ? 1 : 2,
        ...(!input.immediate
          ? {
              start_time: input.startsAt.toISOString(),
              duration: input.durationMinutes,
              timezone: input.timezone,
            }
          : {}),
        ...(input.agenda ? { agenda: input.agenda } : {}),
        ...(input.invitees.length
          ? {
              settings: {
                meeting_invitees: input.invitees.map((email) => ({ email })),
              },
            }
          : {}),
      }),
    });
    if (!meeting.id || !meeting.join_url) {
      throw new BadGatewayException(
        'Zoom created the meeting without a join URL',
      );
    }
    return {
      providerMeetingId: String(meeting.id),
      joinUrl: meeting.join_url,
      startUrl: meeting.start_url,
      metadata: { uuid: meeting.uuid },
    };
  }

  deleteMeeting(accessToken: string, meetingId: string) {
    return this.zoomRequest<void>(
      `/meetings/${encodeURIComponent(meetingId)}`,
      accessToken,
      { method: 'DELETE' },
      20_000,
      [404],
    );
  }

  updateMeeting(
    accessToken: string,
    meetingId: string,
    input: UpdateProviderMeetingInput,
  ) {
    return this.zoomRequest<void>(
      `/meetings/${encodeURIComponent(meetingId)}`,
      accessToken,
      {
        method: 'PATCH',
        body: JSON.stringify({
          topic: input.title,
          start_time: input.startsAt.toISOString(),
          duration: input.durationMinutes,
          timezone: input.timezone,
          agenda: input.agenda || '',
          settings: {
            meeting_invitees: input.invitees.map((email) => ({ email })),
          },
        }),
      },
    );
  }

  getMeeting(accessToken: string, meetingId: string) {
    return this.zoomRequest<{
      id: string | number;
      join_url?: string;
      start_url?: string;
    }>(`/meetings/${encodeURIComponent(meetingId)}`, accessToken);
  }

  private async zoomRequest<T>(
    path: string,
    accessToken: string,
    init: RequestInit = {},
    timeoutMs = 20_000,
    acceptedStatuses: number[] = [],
  ): Promise<T> {
    let response: Response;
    try {
      response = await fetch(`https://api.zoom.us/v2${path}`, {
        ...init,
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/json',
          ...(init.body ? { 'Content-Type': 'application/json' } : {}),
          ...init.headers,
        },
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch {
      throw new ServiceUnavailableException('Zoom API is unavailable');
    }
    if (response.status === 204 || acceptedStatuses.includes(response.status)) {
      return undefined as T;
    }
    const body = (await this.client.parseResponseBody(response)) as {
      message?: string;
      reason?: string;
    };
    if (!response.ok) {
      throw new BadGatewayException(
        body?.message ||
          body?.reason ||
          `Zoom API failed with HTTP ${response.status}`,
      );
    }
    return body as T;
  }
}
