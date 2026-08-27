import { Injectable } from '@nestjs/common';
import { MeetingPlatform } from '../../../common/enums/meeting-platform.enum';
import { RecallApiClient } from './recall-api.client';
import {
  RecallBot,
  RecallMediaArtifact,
  RecallRecording,
} from './recall.types';

type RecallBotList = RecallBot[] | { results?: RecallBot[] };

export type CreateRecallBotInput = {
  platform: MeetingPlatform;
  meetingUrl: string;
  joinAt?: Date;
  botName: string;
  retentionHours: number;
  consentMessage: string;
  zoomZakUrl?: string;
  googleMeetLoginGroupId?: string;
  metadata: Record<string, unknown>;
};

@Injectable()
export class RecallMeetingProvider {
  constructor(private readonly client: RecallApiClient) {}

  createBot(input: CreateRecallBotInput) {
    return this.client.request<RecallBot>('/api/v1/bot/', {
      method: 'POST',
      body: JSON.stringify({
        meeting_url: input.meetingUrl,
        ...(input.joinAt ? { join_at: input.joinAt.toISOString() } : {}),
        bot_name: input.botName,
        recording_config: {
          video_mixed_mp4: null,
          video_mixed_layout: 'audio_only',
          audio_mixed_mp3: {},
          retention: { type: 'timed', hours: input.retentionHours },
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
        ...(input.platform === MeetingPlatform.ZOOM && input.zoomZakUrl
          ? { zoom: { zak_url: input.zoomZakUrl } }
          : {}),
        ...(input.platform === MeetingPlatform.GOOGLE_MEET &&
        input.googleMeetLoginGroupId
          ? {
              google_meet: {
                google_login_group_id: input.googleMeetLoginGroupId,
              },
            }
          : {}),
        metadata: input.metadata,
      }),
    });
  }

  async findBotByMetadata(key: string, value: string) {
    const query = new URLSearchParams({ [`metadata__${key}`]: value });
    const response = await this.client.request<RecallBotList>(
      `/api/v1/bot/?${query.toString()}`,
    );
    const bots = Array.isArray(response) ? response : response.results || [];
    return bots[0];
  }

  updateScheduledBot(
    botId: string,
    input: { meetingUrl?: string; joinAt?: Date; botName?: string },
  ) {
    return this.client.request<RecallBot>(
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

  deleteScheduledBot(botId: string) {
    return this.client.request<void>(
      `/api/v1/bot/${encodeURIComponent(botId)}/`,
      { method: 'DELETE' },
    );
  }

  removeBotFromCall(botId: string) {
    return this.client.request<void>(
      `/api/v1/bot/${encodeURIComponent(botId)}/leave_call/`,
      { method: 'POST', body: '{}' },
    );
  }

  createAsyncTranscript(recordingId: string) {
    return this.client.request<RecallMediaArtifact>(
      `/api/v1/recording/${encodeURIComponent(recordingId)}/create_transcript/`,
      {
        method: 'POST',
        body: JSON.stringify({
          provider: { recallai_async: { language_code: 'auto' } },
          diarization: { use_separate_streams_when_available: true },
        }),
      },
    );
  }

  retrieveRecording(recordingId: string) {
    return this.client.request<RecallRecording>(
      `/api/v1/recording/${encodeURIComponent(recordingId)}/`,
    );
  }

  retrieveTranscript(transcriptId: string) {
    return this.client.request<RecallMediaArtifact>(
      `/api/v1/transcript/${encodeURIComponent(transcriptId)}/`,
    );
  }

  downloadTranscript(downloadUrl: string) {
    return this.client.downloadJson(downloadUrl, 'Transcript');
  }
}
