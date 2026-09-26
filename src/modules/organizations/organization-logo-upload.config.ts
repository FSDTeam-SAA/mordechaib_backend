import { BadRequestException } from '@nestjs/common';
import { MulterOptions } from '@nestjs/platform-express/multer/interfaces/multer-options.interface';
import { memoryStorage } from 'multer';

export const ORGANIZATION_ASSET_MAX_BYTES = 5 * 1024 * 1024;

const ALLOWED_LOGO_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
]);

const ALLOWED_FAVICON_MIME_TYPES = new Set([
  'image/png',
  'image/x-icon',
  'image/vnd.microsoft.icon',
]);

export const ORGANIZATION_ASSET_UPLOAD_OPTIONS: MulterOptions = {
  storage: memoryStorage(),
  limits: {
    files: 2,
    fileSize: ORGANIZATION_ASSET_MAX_BYTES,
    fields: 20,
  },
  fileFilter: (_request, file, callback) => {
    const allowedTypes =
      file.fieldname === 'favicon'
        ? ALLOWED_FAVICON_MIME_TYPES
        : file.fieldname === 'logo'
          ? ALLOWED_LOGO_MIME_TYPES
          : undefined;
    if (!allowedTypes?.has(file.mimetype.toLowerCase())) {
      callback(
        new BadRequestException(
          file.fieldname === 'favicon'
            ? 'Favicon must be a PNG or ICO image'
            : 'Company logo must be a JPEG, PNG, or WebP image',
        ),
        false,
      );
      return;
    }
    callback(null, true);
  },
};
