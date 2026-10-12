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

export type CloudinaryImageUploadInput = {
  file: Express.Multer.File;
  folder: string;
  publicId: string;
  tag: string;
  label: string;
  allowedFormats?: string[];
  transformation?: UploadApiOptions['transformation'];
};

export type CloudinaryImageDeleteInput = {
  folder: string;
  publicId: string;
  label: string;
};

/** Shared Cloudinary upload primitive for durable public image assets. */
@Injectable()
export class CloudinaryImageStorageService {
  private readonly logger = new Logger(CloudinaryImageStorageService.name);

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

  async upload(input: CloudinaryImageUploadInput) {
    this.assertConfigured();
    if (!input.file.buffer?.length) {
      throw new BadGatewayException(
        `${input.label} upload did not include image data`,
      );
    }

    try {
      const result = await this.uploadBuffer(input.file.buffer, {
        resource_type: 'image',
        type: 'upload',
        folder: input.folder.replace(/^\/+|\/+$/g, ''),
        public_id: input.publicId,
        overwrite: true,
        invalidate: true,
        use_filename: false,
        unique_filename: false,
        allowed_formats: input.allowedFormats || [
          'jpg',
          'jpeg',
          'png',
          'webp',
        ],
        transformation: input.transformation,
        tags: [input.tag],
      });
      if (!result.secure_url) {
        throw new Error('Cloudinary returned no secure image URL');
      }
      return result.secure_url;
    } catch (error) {
      if (error instanceof BadGatewayException) throw error;
      this.logger.error(
        `Cloudinary ${input.label.toLowerCase()} upload failed: ${this.errorMessage(error)}`,
      );
      throw new BadGatewayException(`${input.label} upload failed`);
    }
  }

  async delete(input: CloudinaryImageDeleteInput) {
    this.assertConfigured();
    const folder = input.folder.replace(/^\/+|\/+$/g, '');
    const storageKey = folder ? `${folder}/${input.publicId}` : input.publicId;
    try {
      await cloudinary.uploader.destroy(storageKey, {
        resource_type: 'image',
        type: 'upload',
        invalidate: true,
      });
    } catch (error) {
      this.logger.error(
        `Cloudinary ${input.label.toLowerCase()} deletion failed: ${this.errorMessage(error)}`,
      );
      throw new BadGatewayException(`${input.label} deletion failed`);
    }
  }

  private uploadBuffer(buffer: Buffer, options: UploadApiOptions) {
    return new Promise<UploadApiResponse>((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        options,
        (error, result) => {
          if (error) return reject(error);
          if (!result) {
            return reject(new Error('Cloudinary returned no upload result'));
          }
          resolve(result);
        },
      );
      stream.end(buffer);
    });
  }

  private assertConfigured() {
    if (
      !this.config.get<string>('cloudinary.cloudName') ||
      !this.config.get<string>('cloudinary.apiKey') ||
      !this.config.get<string>('cloudinary.apiSecret')
    ) {
      throw new ServiceUnavailableException(
        'Cloudinary image storage is not configured',
      );
    }
  }

  private errorMessage(error: unknown) {
    return error instanceof Error
      ? error.message.slice(0, 300)
      : 'Unknown error';
  }
}
