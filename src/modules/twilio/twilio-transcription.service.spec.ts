import { AiJobsQueue } from '../ai-integration/ai-jobs.queue';
import { CallRecordsService } from '../calls/call-records.service';
import { TwilioTranscriptionService } from './twilio-transcription.service';

describe('TwilioTranscriptionService', () => {
  let callRecords: {
    startTranscription: jest.Mock;
    appendTranscriptionSegment: jest.Mock;
    completeTranscription: jest.Mock;
    failTranscription: jest.Mock;
    findRecordingForCallSids: jest.Mock;
    attachTranscriptToRecording: jest.Mock;
    transcriptionResultForCallSids: jest.Mock;
    markRecordingTranscriptionFailed: jest.Mock;
  };
  let aiJobs: { enqueueSourceAnalysis: jest.Mock };
  let service: TwilioTranscriptionService;

  beforeEach(() => {
    callRecords = {
      startTranscription: jest.fn(),
      appendTranscriptionSegment: jest.fn(),
      completeTranscription: jest.fn(),
      failTranscription: jest.fn(),
      findRecordingForCallSids: jest.fn(),
      attachTranscriptToRecording: jest.fn(),
      transcriptionResultForCallSids: jest.fn(),
      markRecordingTranscriptionFailed: jest.fn(),
    };
    aiJobs = { enqueueSourceAnalysis: jest.fn() };
    service = new TwilioTranscriptionService(
      callRecords as unknown as CallRecordsService,
      aiJobs as unknown as AiJobsQueue,
    );
  });

  it('stores only final transcript content with an idempotency key', async () => {
    await service.handleWebhook({
      CallSid: 'CA123',
      TranscriptionSid: 'GT123',
      TranscriptionEvent: 'transcription-content',
      SequenceId: '2',
      Track: 'inbound_track',
      Final: 'true',
      LanguageCode: 'en-US',
      Timestamp: '2026-10-08T09:00:00.000Z',
      TranscriptionData: JSON.stringify({
        transcript: 'Please schedule a follow-up meeting.',
        confidence: 0.98,
      }),
    });

    expect(callRecords.appendTranscriptionSegment).toHaveBeenCalledWith({
      callSid: 'CA123',
      transcriptionSid: 'GT123',
      segment: expect.objectContaining({
        eventKey: 'GT123:2:inbound_track',
        sequenceId: 2,
        speakerLabel: 'Inbound participant',
        text: 'Please schedule a follow-up meeting.',
        confidence: 0.98,
      }),
    });
  });

  it('does not persist partial transcription content', async () => {
    await service.handleWebhook({
      CallSid: 'CA123',
      TranscriptionSid: 'GT123',
      TranscriptionEvent: 'transcription-content',
      SequenceId: '3',
      Track: 'outbound_track',
      Final: 'false',
      TranscriptionData: JSON.stringify({ transcript: 'partial text' }),
    });

    expect(callRecords.appendTranscriptionSegment).not.toHaveBeenCalled();
  });

  it('persists the official Twilio transcription error fields', async () => {
    await service.handleWebhook({
      CallSid: 'CA123',
      TranscriptionSid: 'GT123',
      TranscriptionEvent: 'transcription-error',
      TranscriptionErrorCode: '32650',
      TranscriptionError: 'Invalid transcription configuration',
    });

    expect(callRecords.failTranscription).toHaveBeenCalledWith({
      callSid: 'CA123',
      transcriptionSid: 'GT123',
      reason: '32650: Invalid transcription configuration',
    });
  });

  it('attaches a completed transcript and queues the existing analysis flow', async () => {
    const completedAt = new Date('2026-10-08T09:01:00.000Z');
    callRecords.completeTranscription.mockResolvedValue({
      call: { callSid: 'CA123' },
      transcriptText: 'Customer: Create a task.',
      segments: [],
      completedAt,
    });
    callRecords.findRecordingForCallSids.mockResolvedValue({
      _id: '507f1f77bcf86cd799439011',
    });
    callRecords.attachTranscriptToRecording.mockResolvedValue({
      _id: '507f1f77bcf86cd799439011',
      organizationId: 'org-1',
    });
    aiJobs.enqueueSourceAnalysis.mockResolvedValue({ queued: true });

    await service.handleWebhook({
      CallSid: 'CA123',
      TranscriptionSid: 'GT123',
      TranscriptionEvent: 'transcription-stopped',
    });

    expect(aiJobs.enqueueSourceAnalysis).toHaveBeenCalledWith({
      organizationId: 'org-1',
      sourceType: 'CALL_TRANSCRIPT',
      sourceId: '507f1f77bcf86cd799439011',
    });
  });

  it('lets the recording callback attach a transcript that completed first', async () => {
    const completedAt = new Date('2026-10-08T09:01:00.000Z');
    callRecords.transcriptionResultForCallSids.mockResolvedValue({
      status: 'COMPLETED',
      transcriptionSid: 'GT123',
      transcriptText: 'Customer: Create a task.',
      transcriptSegments: [],
      completedAt,
    });
    callRecords.attachTranscriptToRecording.mockResolvedValue({
      _id: '507f1f77bcf86cd799439011',
      organizationId: 'org-1',
    });
    aiJobs.enqueueSourceAnalysis.mockResolvedValue({ queued: true });

    await service.reconcileRecording({
      recordingId: '507f1f77bcf86cd799439011',
      callSids: ['CA123'],
    });

    expect(callRecords.attachTranscriptToRecording).toHaveBeenCalledWith({
      recordingId: '507f1f77bcf86cd799439011',
      transcriptionSid: 'GT123',
      transcriptText: 'Customer: Create a task.',
      transcriptSegments: [],
      completedAt,
    });
  });

  it('reconciles an earlier transcription failure when recording arrives', async () => {
    callRecords.transcriptionResultForCallSids.mockResolvedValue({
      status: 'FAILED',
      transcriptionSid: 'GT123',
      reason: '31000: provider unavailable',
    });

    await service.reconcileRecording({
      recordingId: '507f1f77bcf86cd799439011',
      callSids: ['CA123'],
    });

    expect(callRecords.markRecordingTranscriptionFailed).toHaveBeenCalledWith({
      recordingId: '507f1f77bcf86cd799439011',
      transcriptionSid: 'GT123',
      reason: '31000: provider unavailable',
    });
    expect(aiJobs.enqueueSourceAnalysis).not.toHaveBeenCalled();
  });
});
