import { BadRequestException } from '@nestjs/common';
import { MulterOptions } from '@nestjs/platform-express/multer/interfaces/multer-options.interface';
import { memoryStorage } from 'multer';

export const ORGANIZATION_LOGO_MAX_BYTES = 5 * 1024 * 1024;

const ALLOWED_LOGO_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
]);

export const ORGANIZATION_LOGO_UPLOAD_OPTIONS: MulterOptions = {
  storage: memoryStorage(),
  limits: {
    files: 1,
    fileSize: ORGANIZATION_LOGO_MAX_BYTES,
    fields: 20,
  },
  fileFilter: (_request, file, callback) => {
    if (!ALLOWED_LOGO_MIME_TYPES.has(file.mimetype.toLowerCase())) {
      callback(
        new BadRequestException(
          'Company logo must be a JPEG, PNG, or WebP image',
        ),
        false,
      );
      return;
    }
    callback(null, true);
  },
};
