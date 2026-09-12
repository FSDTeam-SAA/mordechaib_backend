import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CallTranscriptionService } from './call-transcription.service';

describe('CallTranscriptionService', () => {
  const recordingId = '66cc9bdfa847ea856c7b41d2';
  const organizationId = '66cc9bdfa847ea856c7b41d3';
  let recordings: Record<string, jest.Mock>;
  let service: CallTranscriptionService;

  beforeEach(() => {
    recordings = {
      findById: jest.fn(),
      findOneAndUpdate: jest.fn(),
      updateOne: jest.fn(),
    };
    service = new CallTranscriptionService(
      recordings as never,
      {
        get: jest.fn((key: string, fallback?: unknown) => {
          if (key === 'aiService.callTranscription.enabled') return true;
          return fallback;
        }),
      } as unknown as ConfigService,
    );
  });

  it('does not transcribe a recording that already has a completed transcript', async () => {
    recordings.findById.mockReturnValue({
      lean: () => ({
        exec: jest.fn().mockResolvedValue({
          organizationId,
          aiStatus: 'COMPLETED',
          transcriptText: 'Existing transcript',
        }),
      }),
    });

    await expect(service.transcribe(recordingId)).resolves.toEqual({
      organizationId,
      duplicate: true,
    });
    expect(recordings.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('marks a recording failed when no local audio is available', async () => {
    recordings.findById.mockReturnValue({
      lean: () => ({
        exec: jest.fn().mockResolvedValue({
          organizationId,
          aiStatus: 'PENDING',
        }),
      }),
    });
    recordings.updateOne.mockResolvedValue({});

    await expect(service.transcribe(recordingId)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(recordings.updateOne).toHaveBeenCalledWith(
      { _id: recordingId },
      expect.objectContaining({
        $set: expect.objectContaining({ aiStatus: 'FAILED' }),
      }),
    );
  });
});
