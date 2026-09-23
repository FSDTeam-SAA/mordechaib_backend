import { BadRequestException } from '@nestjs/common';
import { MulterOptions } from '@nestjs/platform-express/multer/interfaces/multer-options.interface';
import crypto from 'crypto';
import { mkdirSync } from 'fs';
import { diskStorage } from 'multer';
import os from 'os';
import path from 'path';

export const MAX_SUPPORT_ATTACHMENTS = 5;
export const MAX_SUPPORT_ATTACHMENT_BYTES = 10 * 1024 * 1024;

const ALLOWED_UPLOADS = new Map<string, Set<string>>([
  ['application/pdf', new Set(['.pdf'])],
  ['image/jpeg', new Set(['.jpg', '.jpeg'])],
  ['image/png', new Set(['.png'])],
]);

export function isAllowedSupportAttachment(
  originalName: string,
  mimeType: string,
) {
  const extensions = ALLOWED_UPLOADS.get(mimeType.toLowerCase());
  return Boolean(extensions?.has(path.extname(originalName).toLowerCase()));
}

const uploadDirectory = path.join(os.tmpdir(), 'noltra-support-uploads');
mkdirSync(uploadDirectory, { recursive: true });

export const SUPPORT_REQUEST_UPLOAD_OPTIONS: MulterOptions = {
  storage: diskStorage({
    destination: uploadDirectory,
    filename: (_request, file, callback) => {
      callback(
        null,
        `${crypto.randomUUID()}${path.extname(file.originalname).toLowerCase()}`,
      );
    },
  }),
  limits: {
    files: MAX_SUPPORT_ATTACHMENTS,
    fileSize: MAX_SUPPORT_ATTACHMENT_BYTES,
    fields: 5,
  },
  fileFilter: (_request, file, callback) => {
    if (!isAllowedSupportAttachment(file.originalname, file.mimetype)) {
      callback(
        new BadRequestException(
          `Unsupported attachment type: ${path.basename(file.originalname)}`,
        ),
        false,
      );
      return;
    }
    callback(null, true);
  },
};
