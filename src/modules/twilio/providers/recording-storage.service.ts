import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import fs from 'fs/promises';
import path from 'path';
import { TwilioProvider } from './twilio.provider';

@Injectable()
export class RecordingStorageService {
  private readonly logger = new Logger(RecordingStorageService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly twilioProvider: TwilioProvider,
  ) {}

  /**
   * Downloads a completed Twilio recording and stores it on disk.
   *
   * The recording URL is authenticated — it must be fetched using the Twilio
   * API credentials (Basic auth) and an HTTPS method. `createCall` is used to
   * fetch the media, then the binary is written to
   * `{RECORDING_STORAGE_DIR}/{callSid}/{recordingSid}.{format}`.
   *
   * @returns local path of the stored audio file, or null on failure
   */
  async storeRecording(input: {
    callSid: string;
    recordingSid: string;
    recordingUrl: string;
  }): Promise<string | null> {
    try {
      const storageDir = this.config.get<string>(
        'RECORDING_STORAGE_DIR',
        './storage/recordings',
      );
      const callDir = path.join(storageDir, input.callSid);
      await fs.mkdir(callDir, { recursive: true });

      const extension = this.getExtensionFromUrl(input.recordingUrl);
      const filename = `${input.recordingSid}${extension}`;
      const filePath = path.join(callDir, filename);

      const mediaBuf = await this.twilioProvider.downloadRecordingMedia(
        input.recordingUrl,
      );
      if (!mediaBuf || mediaBuf.length === 0) {
        this.logger.warn(
          `Empty audio received for recording ${input.recordingSid}`,
        );
        return null;
      }

      await fs.writeFile(filePath, mediaBuf);
      this.logger.log(
        `Stored recording ${input.recordingSid} at ${filePath} (${mediaBuf.length} bytes)`,
      );
      return filePath;
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : 'Unknown storage error';
      this.logger.error(
        `Failed to store recording ${input.recordingSid}: ${message}`,
      );
      return null;
    }
  }

  private getExtensionFromUrl(url: string): string {
    const cleaned = url.split('?')[0].toLowerCase();
    if (cleaned.endsWith('.wav')) return '.wav';
    if (cleaned.endsWith('.mp3')) return '.mp3';
    if (cleaned.endsWith('.ogg')) return '.ogg';
    if (cleaned.endsWith('.m4a')) return '.m4a';
    // Twilio default format is .wav when no extension is present
    return '.wav';
  }
}