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

@Injectable()
export class OrganizationLogoStorageService {
  private readonly logger = new Logger(OrganizationLogoStorageService.name);

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

  async upload(organizationId: string, file: Express.Multer.File) {
    this.assertConfigured();
    if (!file.buffer?.length) {
      throw new BadGatewayException(
        'Company logo upload did not include image data',
      );
    }

    const folder = this.config
      .get<string>(
        'cloudinary.organizationLogoFolder',
        'noltra/organization-logos',
      )
      .replace(/^\/+|\/+$/g, '');

    try {
      const response = await this.uploadBuffer(file.buffer, {
        resource_type: 'image',
        type: 'upload',
        folder,
        public_id: organizationId,
        overwrite: true,
        invalidate: true,
        use_filename: false,
        unique_filename: false,
        allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
        transformation: [{ width: 512, height: 512, crop: 'limit' }],
        tags: ['noltra-organization-logo'],
      });
      if (!response.secure_url) {
        throw new Error('Cloudinary returned no secure company logo URL');
      }
      return response.secure_url;
    } catch (error) {
      if (error instanceof BadGatewayException) throw error;
      this.logger.error(
        `Cloudinary company logo upload failed: ${this.safeErrorMessage(error)}`,
      );
      throw new BadGatewayException('Company logo upload failed');
    }
  }

  private uploadBuffer(buffer: Buffer, options: UploadApiOptions) {
    return new Promise<UploadApiResponse>((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        options,
        (error, result) => {
          if (error) {
            reject(error);
            return;
          }
          if (!result) {
            reject(new Error('Cloudinary returned no upload result'));
            return;
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
        'Cloudinary company logo storage is not configured',
      );
    }
  }

  private safeErrorMessage(error: unknown) {
    return error instanceof Error
      ? error.message.slice(0, 300)
      : 'Unknown error';
  }
}
