export const MEETING_AUDIO_STORAGE = Symbol('MEETING_AUDIO_STORAGE');

export type SaveMeetingAudioInput = {
  recordingId: string;
  downloadUrl?: string;
  expiresAt?: Date;
};

export type StoredMeetingAudio = {
  provider: string;
  reference: string;
  expiresAt?: Date;
};

export type MeetingAudioDownload = {
  downloadUrl: string;
  expiresAt?: Date;
  storageProvider: string;
};

export interface MeetingAudioStorage {
  save(input: SaveMeetingAudioInput): Promise<StoredMeetingAudio>;
  getDownload(reference: string): Promise<MeetingAudioDownload>;
  delete?(reference: string): Promise<void>;
}
