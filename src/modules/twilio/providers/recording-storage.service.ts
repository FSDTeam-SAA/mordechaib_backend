import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import fs from 'fs/promises';
import path from 'path';
import { TwilioAccountContext, TwilioProvider } from './twilio.provider';
import { MessageAttachmentCategory } from '../../../common/enums/message-attachment-category.enum';
import { CloudinaryMessageAttachmentStorage } from '../../messages/storage/cloudinary-message-attachment.storage';

export type CallRecordingStorageReference = {
  storageProvider: string;
  storageKey: string;
  storageAssetId?: string;
  storageResourceType: string;
  storageDeliveryType: string;
  storageFormat: string;
};

@Injectable()
export class RecordingStorageService {
  private readonly logger = new Logger(RecordingStorageService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly twilioProvider: TwilioProvider,
    private readonly cloudinaryStorage: CloudinaryMessageAttachmentStorage,
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
    organizationId: string;
    callSid: string;
    recordingSid: string;
    recordingUrl: string;
    accountContext?: TwilioAccountContext;
  }): Promise<{
    localFilePath: string;
    persistentStorage?: CallRecordingStorageReference;
  } | null> {
    try {
      const storageDir = path.resolve(
        this.config.get<string>(
          'RECORDING_STORAGE_DIR',
          './storage/recordings',
        ),
      );
      const callDir = path.join(storageDir, input.callSid);
      await fs.mkdir(callDir, { recursive: true });

      const extension = this.getExtensionFromUrl(input.recordingUrl);
      const filename = `${input.recordingSid}${extension}`;
      const filePath = path.join(callDir, filename);

      const mediaBuf = await this.twilioProvider.downloadRecordingMedia(
        input.recordingUrl,
        input.accountContext,
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

      let persistentStorage: CallRecordingStorageReference | undefined;
      try {
        const stored = await this.cloudinaryStorage.store({
          organizationId: input.organizationId,
          conversationId: input.callSid,
          storageScopeId: input.callSid,
          uploadId: input.recordingSid,
          localPath: filePath,
          originalName: filename,
          mimeType: this.mimeType(extension),
          sizeBytes: mediaBuf.length,
          category: MessageAttachmentCategory.AUDIO,
          storageFolder: 'noltra/call-recordings',
          storageTags: ['noltra-call-recording'],
          overwrite: true,
          visibility: 'PRIVATE',
        });
        persistentStorage = {
          storageProvider: stored.storageProvider,
          storageKey: stored.storageKey,
          storageAssetId: stored.storageAssetId,
          storageResourceType: stored.storageResourceType,
          storageDeliveryType: stored.storageDeliveryType,
          storageFormat: stored.storageFormat,
        };
      } catch (error) {
        this.logger.warn(
          `Persistent call recording upload failed for ${input.recordingSid}; local copy retained: ${error instanceof Error ? error.message : 'Unknown storage error'}`,
        );
      }
      return { localFilePath: filePath, persistentStorage };
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : 'Unknown storage error';
      this.logger.error(
        `Failed to store recording ${input.recordingSid}: ${message}`,
      );
      return null;
    }
  }

  deletePersistentRecording(reference: CallRecordingStorageReference) {
    if (reference.storageProvider !== 'CLOUDINARY') return Promise.resolve();
    return this.cloudinaryStorage.delete(reference);
  }

  async deleteRecording(filePath: string) {
    const storageRoot = path.resolve(
      this.config.get<string>('RECORDING_STORAGE_DIR', './storage/recordings'),
    );
    const target = path.resolve(filePath);
    const relative = path.relative(storageRoot, target);
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
      throw new Error(
        'Recording path is outside the configured storage directory',
      );
    }
    try {
      await fs.unlink(target);
    } catch (error) {
      if (
        error &&
        typeof error === 'object' &&
        'code' in error &&
        error.code === 'ENOENT'
      ) {
        return;
      }
      throw error;
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

  private mimeType(extension: string) {
    switch (extension.toLowerCase()) {
      case '.mp3':
        return 'audio/mpeg';
      case '.m4a':
        return 'audio/mp4';
      case '.ogg':
        return 'audio/ogg';
      default:
        return 'audio/wav';
    }
  }
}
