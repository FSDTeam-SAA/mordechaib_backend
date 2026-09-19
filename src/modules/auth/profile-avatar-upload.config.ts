import { BadRequestException } from '@nestjs/common';
import { MulterOptions } from '@nestjs/platform-express/multer/interfaces/multer-options.interface';
import { memoryStorage } from 'multer';

export const PROFILE_AVATAR_MAX_BYTES = 5 * 1024 * 1024;

const ALLOWED_AVATAR_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
]);

export const PROFILE_AVATAR_UPLOAD_OPTIONS: MulterOptions = {
  storage: memoryStorage(),
  limits: {
    files: 1,
    fileSize: PROFILE_AVATAR_MAX_BYTES,
    fields: 10,
  },
  fileFilter: (_request, file, callback) => {
    if (!ALLOWED_AVATAR_MIME_TYPES.has(file.mimetype.toLowerCase())) {
      callback(
        new BadRequestException('Avatar must be a JPEG, PNG, or WebP image'),
        false,
      );
      return;
    }
    callback(null, true);
  },
};
