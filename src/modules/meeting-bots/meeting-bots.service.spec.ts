import { ConfigService } from '@nestjs/config';
import { MeetingBotStatus } from '../../common/enums/meeting-bot-status.enum';
import { MeetingPlatform } from '../../common/enums/meeting-platform.enum';
import { MeetingBotsQueue } from './meeting-bots.queue';
import { MeetingBotsRepository } from './meeting-bots.repository';
import { MeetingBotsService } from './meeting-bots.service';
import { RecallMeetingProvider } from './providers/recall-meeting.provider';
import { MeetingAudioStorage } from './storage/meeting-audio-storage.interface';
import { ZoomAuthService } from './zoom-auth.service';

describe('MeetingBotsService', () => {
  const meetingId = '66cc9bdfa847ea856c7b41d2';
  let repository: Record<string, jest.Mock>;
  let queue: Record<string, jest.Mock>;
  let zoomAuth: Record<string, jest.Mock | boolean | string>;
  let provider: Record<string, jest.Mock>;
  let audioStorage: Record<string, jest.Mock>;
  let service: MeetingBotsService;

  beforeEach(() => {
    repository = {
      findDuplicate: jest.fn().mockResolvedValue(null),
      countActive: jest.fn().mockResolvedValue(0),
      createOrFind: jest.fn().mockResolvedValue({
        created: true,
        meeting: {
          _id: meetingId,
          platform: MeetingPlatform.GOOGLE_MEET,
          organizationId: 'org-1',
          status: MeetingBotStatus.PENDING,
        },
      }),
      updateById: jest.fn(),
      findByIdForOrganization: jest.fn(),
      claimWebhookEvent: jest.fn(),
      completeWebhookEvent: jest.fn(),
      failWebhookEvent: jest.fn(),
      claimTranscription: jest.fn(),
      releaseTranscriptionClaim: jest.fn(),
      findByRecordingId: jest.fn(),
      upsertTranscript: jest.fn(),
    };
    queue = { enqueueBotCreation: jest.fn().mockResolvedValue(undefined) };
    zoomAuth = {
      assertConnected: jest.fn().mockResolvedValue(undefined),
      signedInEnabled: true,
      zakCallbackUrl: 'https://backend.example/api/v1/webhooks/recall/zoom-zak',
    };
    provider = {
      findBotByMetadata: jest.fn(),
      createBot: jest.fn(),
      retrieveRecording: jest.fn(),
      createAsyncTranscript: jest.fn(),
      retrieveTranscript: jest.fn(),
      downloadTranscript: jest.fn(),
    };
    audioStorage = { save: jest.fn(), getDownload: jest.fn() };
    const config = {
      get: jest.fn((key: string, fallback?: unknown) => {
        const values: Record<string, unknown> = {
          'recall.apiKey': 'recall-key',
          'recall.webhookSecret': 'whsec_secret',
          'recall.maxConcurrentMeetings': 100,
          'recall.maxConcurrentMeetingsPerOrganization': 10,
        };
        return values[key] ?? fallback;
      }),
      getOrThrow: jest.fn((key: string) => {
        if (key === 'recall.encryptionKey') return 'x'.repeat(32);
        throw new Error(`Unexpected configuration key: ${key}`);
      }),
    };
    service = new MeetingBotsService(
      repository as unknown as MeetingBotsRepository,
      provider as unknown as RecallMeetingProvider,
      queue as unknown as MeetingBotsQueue,
      zoomAuth as unknown as ZoomAuthService,
      config as unknown as ConfigService,
      audioStorage as unknown as MeetingAudioStorage,
    );
  });

  it('creates a Google Meet bot without requiring a Zoom connection', async () => {
    await service.create('org-1', 'user-1', MeetingPlatform.GOOGLE_MEET, {
      meetingUrl: 'https://meet.google.com/abc-defg-hij',
      idempotencyKey: 'meeting-1',
    });

    expect(zoomAuth.assertConnected).not.toHaveBeenCalled();
    expect(repository.createOrFind).toHaveBeenCalledWith(
      expect.objectContaining({
        platform: MeetingPlatform.GOOGLE_MEET,
        organizationId: 'org-1',
      }),
    );
    expect(queue.enqueueBotCreation).toHaveBeenCalledWith(meetingId);
  });

  it('requires the signed-in Zoom connection for Zoom bots', async () => {
    repository.createOrFind.mockResolvedValue({
      created: true,
      meeting: {
        _id: meetingId,
        platform: MeetingPlatform.ZOOM,
        organizationId: 'org-1',
      },
    });
    await service.create('org-1', 'user-1', MeetingPlatform.ZOOM, {
      meetingUrl: 'https://zoom.us/j/123456789?pwd=secret',
    });
    expect(zoomAuth.assertConnected).toHaveBeenCalledTimes(1);
  });

  it('scopes platform-specific reads to the organization and platform', async () => {
    repository.findByIdForOrganization.mockResolvedValue({
      _id: meetingId,
      organizationId: 'org-1',
      platform: MeetingPlatform.GOOGLE_MEET,
    });
    await service.get('org-1', meetingId, MeetingPlatform.GOOGLE_MEET);
    expect(repository.findByIdForOrganization).toHaveBeenCalledWith(
      meetingId,
      'org-1',
      MeetingPlatform.GOOGLE_MEET,
    );
  });

  it('does not process an already claimed webhook event twice', async () => {
    repository.claimWebhookEvent.mockResolvedValue({ claimed: false });
    await service.processWebhook('event-1', {
      event: 'recording.done',
      data: { recording: { id: 'recording-1' } },
    });
    expect(repository.completeWebhookEvent).not.toHaveBeenCalled();
    expect(repository.failWebhookEvent).not.toHaveBeenCalled();
  });

  it('starts async transcription after a recording is ready', async () => {
    repository.claimWebhookEvent.mockResolvedValue({ claimed: true });
    repository.claimTranscription.mockResolvedValue({ _id: meetingId });
    provider.retrieveRecording.mockResolvedValue({
      id: 'recording-1',
      expires_at: '2026-09-01T00:00:00.000Z',
      media_shortcuts: {
        audio_mixed: { data: { download_url: 'https://audio.example/a.mp3' } },
      },
    });
    audioStorage.save.mockResolvedValue({
      provider: 'RECALL',
      reference: 'recording-1',
      expiresAt: new Date('2026-09-01T00:00:00.000Z'),
    });

    await service.processWebhook('event-recording', {
      event: 'recording.done',
      data: {
        bot: { id: 'bot-1' },
        recording: { id: 'recording-1' },
      },
    });

    expect(audioStorage.save).toHaveBeenCalledWith(
      expect.objectContaining({ recordingId: 'recording-1' }),
    );
    expect(provider.createAsyncTranscript).toHaveBeenCalledWith('recording-1');
    expect(repository.completeWebhookEvent).toHaveBeenCalledWith(
      'event-recording',
    );
  });

  it('stores a completed transcript under its meeting platform', async () => {
    repository.claimWebhookEvent.mockResolvedValue({ claimed: true });
    repository.findByRecordingId.mockResolvedValue({
      _id: meetingId,
      organizationId: 'org-1',
      platform: MeetingPlatform.GOOGLE_MEET,
    });
    provider.retrieveTranscript.mockResolvedValue({
      data: { download_url: 'https://transcript.example/t.json' },
    });
    provider.downloadTranscript.mockResolvedValue([
      {
        participant: { name: 'Alice' },
        words: [{ text: 'Hello' }, { text: 'world' }],
      },
    ]);

    await service.processWebhook('event-transcript', {
      event: 'transcript.done',
      data: {
        recording: { id: 'recording-1' },
        transcript: { id: 'transcript-1' },
      },
    });

    expect(repository.upsertTranscript).toHaveBeenCalledWith(
      expect.objectContaining({
        meetingId,
        platform: MeetingPlatform.GOOGLE_MEET,
        transcriptText: 'Alice: Hello world',
        wordCount: 2,
      }),
    );
    expect(repository.updateById).toHaveBeenCalledWith(
      meetingId,
      expect.objectContaining({ status: MeetingBotStatus.COMPLETED }),
    );
  });
});
