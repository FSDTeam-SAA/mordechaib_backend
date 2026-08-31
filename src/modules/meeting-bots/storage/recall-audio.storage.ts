import { Injectable, NotFoundException } from '@nestjs/common';
import { RecallMeetingProvider } from '../providers/recall-meeting.provider';
import {
  MeetingAudioDownload,
  MeetingAudioStorage,
  SaveMeetingAudioInput,
  StoredMeetingAudio,
} from './meeting-audio-storage.interface';

@Injectable()
export class RecallAudioStorage implements MeetingAudioStorage {
  constructor(private readonly recall: RecallMeetingProvider) {}

  save(input: SaveMeetingAudioInput): Promise<StoredMeetingAudio> {
    return Promise.resolve({
      provider: 'RECALL',
      reference: input.recordingId,
      expiresAt: input.expiresAt,
    });
  }

  async getDownload(reference: string): Promise<MeetingAudioDownload> {
    const recording = await this.recall.retrieveRecording(reference);
    const downloadUrl =
      recording.media_shortcuts?.audio_mixed?.data?.download_url;
    if (!downloadUrl) {
      throw new NotFoundException(
        'Meeting audio is unavailable or has expired',
      );
    }
    return {
      downloadUrl,
      expiresAt: recording.expires_at
        ? new Date(recording.expires_at)
        : undefined,
      storageProvider: 'RECALL',
    };
  }
}
