import {
  BadGatewayException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  UploadApiOptions,
  UploadApiResponse,
  v2 as cloudinary,
} from 'cloudinary';
import { MessageAttachmentCategory } from '../../../common/enums/message-attachment-category.enum';
import {
  MessageAttachmentDownload,
  MessageAttachmentStorage,
  MessageAttachmentStorageReference,
  StoredMessageAttachment,
  StoreMessageAttachmentInput,
} from './message-attachment-storage.interface';

@Injectable()
export class CloudinaryMessageAttachmentStorage implements MessageAttachmentStorage {
  private readonly logger = new Logger(CloudinaryMessageAttachmentStorage.name);

  constructor(private readonly config: ConfigService) {
    const cloudName = this.config.get<string>('cloudinary.cloudName');
    const apiKey = this.config.get<string>('cloudinary.apiKey');
    const apiSecret = this.config.get<string>('cloudinary.apiSecret');
    if (cloudName && apiKey && apiSecret) {
      cloudinary.config({
        cloud_name: cloudName,
        api_key: apiKey,
        api_secret: apiSecret,
        secure: true,
      });
    }
  }

  async store(
    input: StoreMessageAttachmentInput,
  ): Promise<StoredMessageAttachment> {
    this.assertConfigured();
    const resourceType = this.resourceType(input.category);
    const extension = this.extension(input.originalName);
    const folder = [
      this.config.get<string>('cloudinary.messageFolder', 'noltra/messages'),
      input.organizationId,
      input.conversationId,
    ]
      .map((part) => part.replace(/^\/+|\/+$/g, ''))
      .join('/');
    const options = {
      resource_type: resourceType,
      type: 'authenticated' as const,
      folder,
      // Cloudinary includes the extension in a raw asset's public ID. Image and
      // video public IDs must remain extension-free so transformations and
      // signed delivery URLs work consistently.
      public_id:
        resourceType === 'raw' && extension
          ? `${input.uploadId}.${extension}`
          : input.uploadId,
      overwrite: false,
      use_filename: false,
      tags: ['noltra-message-attachment'],
      filename_override: input.originalName,
    };

    try {
      const response =
        input.sizeBytes > 100 * 1024 * 1024
          ? await this.uploadLarge(input.localPath, {
              ...options,
              chunk_size: 20 * 1024 * 1024,
            })
          : await cloudinary.uploader.upload(input.localPath, options);

      return {
        storageProvider: 'CLOUDINARY',
        storageKey: response.public_id,
        storageAssetId: response.asset_id as string | undefined,
        storageResourceType: response.resource_type,
        storageDeliveryType: response.type,
        storageFormat: response.format || extension || 'bin',
        sizeBytes: response.bytes,
      };
    } catch (error) {
      this.logger.error(
        `Cloudinary attachment upload failed: ${this.safeErrorMessage(error)}`,
      );
      throw new BadGatewayException('Message attachment upload failed');
    }
  }

  async getDownload(
    reference: MessageAttachmentStorageReference,
    disposition: 'inline' | 'attachment',
  ): Promise<MessageAttachmentDownload> {
    this.assertConfigured();
    const ttlSeconds = this.config.get<number>(
      'cloudinary.downloadUrlTtlSeconds',
      300,
    );
    const expiresAt = new Date(Date.now() + ttlSeconds * 1_000);
    const downloadUrl = cloudinary.utils.private_download_url(
      reference.storageKey,
      reference.storageFormat,
      {
        resource_type: reference.storageResourceType,
        type: reference.storageDeliveryType,
        expires_at: Math.floor(expiresAt.getTime() / 1_000),
        attachment: disposition === 'attachment',
      },
    );
    return { downloadUrl, expiresAt };
  }

  async delete(reference: MessageAttachmentStorageReference): Promise<void> {
    this.assertConfigured();
    try {
      const result = await cloudinary.uploader.destroy(reference.storageKey, {
        resource_type: reference.storageResourceType,
        type: reference.storageDeliveryType,
        invalidate: true,
      });
      if (!['ok', 'not found'].includes(String(result.result))) {
        throw new Error(
          `Unexpected Cloudinary deletion result: ${result.result}`,
        );
      }
    } catch (error) {
      this.logger.error(
        `Cloudinary attachment deletion failed: ${this.safeErrorMessage(error)}`,
      );
      throw new BadGatewayException('Message attachment deletion failed');
    }
  }

  private resourceType(category: MessageAttachmentCategory) {
    if (
      category === MessageAttachmentCategory.AUDIO ||
      category === MessageAttachmentCategory.VIDEO
    ) {
      return 'video' as const;
    }
    if (category === MessageAttachmentCategory.DOCUMENT) return 'raw' as const;
    return 'image' as const;
  }

  private extension(filename: string) {
    const dot = filename.lastIndexOf('.');
    return dot >= 0 ? filename.slice(dot + 1).toLowerCase() : undefined;
  }

  private uploadLarge(
    localPath: string,
    options: UploadApiOptions,
  ): Promise<UploadApiResponse> {
    return new Promise((resolve, reject) => {
      cloudinary.uploader.upload_large(localPath, options, (error, result) => {
        if (error) {
          reject(error);
          return;
        }
        if (!result) {
          reject(new Error('Cloudinary returned no upload result'));
          return;
        }
        resolve(result);
      });
    });
  }

  private assertConfigured() {
    if (
      !this.config.get<string>('cloudinary.cloudName') ||
      !this.config.get<string>('cloudinary.apiKey') ||
      !this.config.get<string>('cloudinary.apiSecret')
    ) {
      throw new ServiceUnavailableException(
        'Cloudinary message storage is not configured',
      );
    }
  }

  private safeErrorMessage(error: unknown) {
    if (error instanceof Error) return error.message.slice(0, 300);
    return 'Unknown storage provider error';
  }
}
