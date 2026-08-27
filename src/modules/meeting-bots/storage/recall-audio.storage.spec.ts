import { NotFoundException } from '@nestjs/common';
import { RecallMeetingProvider } from '../providers/recall-meeting.provider';
import { RecallAudioStorage } from './recall-audio.storage';

describe('RecallAudioStorage', () => {
  it('uses the recording ID as its durable storage reference', async () => {
    const storage = new RecallAudioStorage({} as RecallMeetingProvider);
    await expect(
      storage.save({
        recordingId: 'recording-1',
        downloadUrl: 'https://temporary.example/audio.mp3',
      }),
    ).resolves.toEqual({
      provider: 'RECALL',
      reference: 'recording-1',
      expiresAt: undefined,
    });
  });

  it('returns a freshly retrieved Recall download URL', async () => {
    const retrieveRecording = jest.fn().mockResolvedValue({
      id: 'recording-1',
      expires_at: '2026-09-01T00:00:00.000Z',
      media_shortcuts: {
        audio_mixed: { data: { download_url: 'https://fresh.example/a.mp3' } },
      },
    });
    const storage = new RecallAudioStorage({
      retrieveRecording,
    } as unknown as RecallMeetingProvider);

    await expect(storage.getDownload('recording-1')).resolves.toEqual({
      downloadUrl: 'https://fresh.example/a.mp3',
      expiresAt: new Date('2026-09-01T00:00:00.000Z'),
      storageProvider: 'RECALL',
    });
  });

  it('rejects recordings without an audio artifact', async () => {
    const storage = new RecallAudioStorage({
      retrieveRecording: jest.fn().mockResolvedValue({ id: 'recording-1' }),
    } as unknown as RecallMeetingProvider);
    await expect(storage.getDownload('recording-1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
