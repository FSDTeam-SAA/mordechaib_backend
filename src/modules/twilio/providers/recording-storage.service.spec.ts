import path from 'path';
import { ConfigService } from '@nestjs/config';
import { RecordingStorageService } from './recording-storage.service';
import { TwilioProvider } from './twilio.provider';

describe('RecordingStorageService deletion', () => {
  it('rejects deletion outside the configured recording directory', async () => {
    const storageRoot = path.resolve('storage/recordings');
    const config = {
      get: jest.fn().mockReturnValue(storageRoot),
    };
    const service = new RecordingStorageService(
      config as unknown as ConfigService,
      {} as TwilioProvider,
    );

    await expect(
      service.deleteRecording(path.resolve('storage/outside.wav')),
    ).rejects.toThrow(
      'Recording path is outside the configured storage directory',
    );
  });
});
