import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export class RecallApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly responseBody?: unknown,
  ) {
    super(message);
    this.name = 'RecallApiError';
  }

  get retryable() {
    return this.status === 409 || this.status === 429 || this.status >= 500;
  }
}

export type RecallBot = {
  id: string;
  status_changes?: Array<{
    code?: string;
    sub_code?: string;
    message?: string;
    created_at?: string;
  }>;
  recordings?: RecallRecording[];
  [key: string]: unknown;
};

type RecallBotList = RecallBot[] | { results?: RecallBot[] };

export type RecallRecording = {
  id: string;
  expires_at?: string | null;
  media_shortcuts?: {
    audio_mixed?: RecallMediaArtifact | null;
    transcript?: RecallMediaArtifact | null;
  };
  [key: string]: unknown;
};

export type RecallMediaArtifact = {
  id?: string;
  data?: { download_url?: string } | null;
  metadata?: Record<string, unknown>;
  [key: string]: unknown;
};

export type RecallWebhookPayload = {
  event: string;
  data?: {
    data?: {
      code?: string;
      sub_code?: string | null;
      message?: string;
      updated_at?: string;
    };
    bot?: { id?: string; [key: string]: unknown };
    recording?: { id?: string; [key: string]: unknown };
    transcript?: { id?: string; [key: string]: unknown };
    [key: string]: unknown;
  };
  [key: string]: unknown;
};

type CreateBotInput = {
  meetingUrl: string;
  joinAt?: Date;
  botName: string;
  retentionHours: number;
  consentMessage: string;
  zakUrl?: string;
  metadata: Record<string, unknown>;
};

@Injectable()
export class RecallZoomProvider {
  constructor(private readonly config: ConfigService) {}

  getZoomAuthorizationUrl(state: string) {
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

  createBot(input: CreateBotInput) {
    return this.recallRequest<RecallBot>('/api/v1/bot/', {
      method: 'POST',
      body: JSON.stringify({
        meeting_url: input.meetingUrl,
        ...(input.joinAt ? { join_at: input.joinAt.toISOString() } : {}),
        bot_name: input.botName,
        recording_config: {
          video_mixed_mp4: null,
          video_mixed_layout: 'audio_only',
          audio_mixed_mp3: {},
          retention: {
            type: 'timed',
            hours: input.retentionHours,
          },
        },
        chat: {
          on_bot_join: {
            send_to: 'everyone',
            message: input.consentMessage,
          },
          on_participant_join: {
            exclude_host: false,
            message: input.consentMessage,
          },
        },
        ...(input.zakUrl ? { zoom: { zak_url: input.zakUrl } } : {}),
        metadata: input.metadata,
      }),
    });
  }

  async findBotByMetadata(key: string, value: string) {
    const query = new URLSearchParams({ [`metadata__${key}`]: value });
    const response = await this.recallRequest<RecallBotList>(
      `/api/v1/bot/?${query.toString()}`,
    );
    const bots = Array.isArray(response) ? response : response.results || [];
    return bots[0];
  }

  updateScheduledBot(
    botId: string,
    input: { meetingUrl?: string; joinAt?: Date; botName?: string },
  ) {
    return this.recallRequest<RecallBot>(
      `/api/v1/bot/${encodeURIComponent(botId)}/`,
      {
        method: 'PATCH',
        body: JSON.stringify({
          ...(input.meetingUrl ? { meeting_url: input.meetingUrl } : {}),
          ...(input.joinAt ? { join_at: input.joinAt.toISOString() } : {}),
          ...(input.botName ? { bot_name: input.botName } : {}),
        }),
      },
    );
  }

  retrieveBot(botId: string) {
    return this.recallRequest<RecallBot>(
      `/api/v1/bot/${encodeURIComponent(botId)}/`,
    );
  }

  deleteScheduledBot(botId: string) {
    return this.recallRequest<void>(
      `/api/v1/bot/${encodeURIComponent(botId)}/`,
      { method: 'DELETE' },
    );
  }

  removeBotFromCall(botId: string) {
    return this.recallRequest<void>(
      `/api/v1/bot/${encodeURIComponent(botId)}/leave_call/`,
      { method: 'POST', body: '{}' },
    );
  }

  createAsyncTranscript(recordingId: string) {
    return this.recallRequest<RecallMediaArtifact>(
      `/api/v1/recording/${encodeURIComponent(recordingId)}/create_transcript/`,
      {
        method: 'POST',
        body: JSON.stringify({
          provider: {
            recallai_async: { language_code: 'auto' },
          },
          diarization: {
            use_separate_streams_when_available: true,
          },
        }),
      },
    );
  }

  retrieveRecording(recordingId: string) {
    return this.recallRequest<RecallRecording>(
      `/api/v1/recording/${encodeURIComponent(recordingId)}/`,
    );
  }

  retrieveTranscript(transcriptId: string) {
    return this.recallRequest<RecallMediaArtifact>(
      `/api/v1/transcript/${encodeURIComponent(transcriptId)}/`,
    );
  }

  async downloadTranscript(downloadUrl: string): Promise<unknown> {
    let response: Response;
    try {
      response = await fetch(downloadUrl, {
        signal: AbortSignal.timeout(30_000),
      });
    } catch (error) {
      throw new RecallApiError(
        error instanceof Error
          ? `Transcript download failed: ${error.message}`
          : 'Transcript download failed',
        503,
      );
    }
    if (!response.ok) {
      throw new RecallApiError(
        `Transcript download failed with HTTP ${response.status}`,
        response.status,
      );
    }
    return response.json();
  }

  createZoomOAuthCredential(code: string) {
    const oauthAppId = this.config.get<string>('recall.zoom.oauthAppId');
    const redirectUri = this.config.get<string>('recall.zoom.redirectUri');
    if (!oauthAppId || !redirectUri) {
      throw new ServiceUnavailableException(
        'Recall Zoom OAuth app is not configured',
      );
    }
    return this.recallRequest<{ id: string; [key: string]: unknown }>(
      '/api/v2/zoom-oauth-credentials/',
      {
        method: 'POST',
        body: JSON.stringify({
          oauth_app: oauthAppId,
          authorization_code: {
            code,
            redirect_uri: redirectUri,
          },
        }),
      },
    );
  }

  getZoomAccessToken(credentialId: string) {
    return this.recallRequest<{ access_token?: string; token?: string }>(
      `/api/v2/zoom-oauth-credentials/${encodeURIComponent(credentialId)}/access-token/`,
      {},
      7_000,
    );
  }

  async getZakToken(credentialId: string) {
    const tokenResponse = await this.getZoomAccessToken(credentialId);
    const accessToken = tokenResponse.access_token ?? tokenResponse.token;
    if (!accessToken) {
      throw new RecallApiError(
        'Recall Zoom credential did not return an access token',
        502,
      );
    }

    const response = await fetch('https://api.zoom.us/v2/users/me/zak', {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(7_000),
    });
    const body = (await this.parseResponseBody(response)) as {
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

  private async recallRequest<T>(
    path: string,
    init: RequestInit = {},
    timeoutMs = 20_000,
  ): Promise<T> {
    const apiKey = this.config.get<string>('recall.apiKey');
    const baseUrl = this.config.get<string>('recall.apiBaseUrl');
    if (!apiKey || !baseUrl) {
      throw new ServiceUnavailableException('Recall.ai is not configured');
    }

    let response: Response;
    try {
      response = await fetch(`${baseUrl.replace(/\/+$/, '')}${path}`, {
        ...init,
        headers: {
          Authorization: `Token ${apiKey}`,
          Accept: 'application/json',
          ...(init.body ? { 'Content-Type': 'application/json' } : {}),
          ...init.headers,
        },
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      throw new RecallApiError(
        error instanceof Error
          ? `Recall.ai request failed: ${error.message}`
          : 'Recall.ai request failed',
        503,
      );
    }

    const body = await this.parseResponseBody(response);
    if (!response.ok) {
      const detail =
        this.extractErrorMessage(body) ||
        `Recall.ai request failed with HTTP ${response.status}`;
      throw new RecallApiError(detail, response.status, body);
    }
    return body as T;
  }

  private extractErrorMessage(body: unknown): string | undefined {
    if (typeof body === 'string') return body.slice(0, 1000);

    if (Array.isArray(body)) {
      const messages = body
        .map((item) => this.extractErrorMessage(item))
        .filter((item): item is string => Boolean(item));
      return messages.length ? messages.join('; ').slice(0, 1000) : undefined;
    }

    if (!body || typeof body !== 'object') return undefined;

    const record = body as Record<string, unknown>;
    for (const key of [
      'detail',
      'message',
      'error_description',
      'error',
      'non_field_errors',
    ]) {
      const message = this.extractErrorMessage(record[key]);
      if (message) return message;
    }

    return undefined;
  }

  private async parseResponseBody(response: Response): Promise<unknown> {
    const text = await response.text();
    if (!text) return undefined;
    try {
      return JSON.parse(text) as unknown;
    } catch {
      return { message: text.slice(0, 1000) };
    }
  }
}
