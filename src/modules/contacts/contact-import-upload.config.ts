import { BadRequestException } from '@nestjs/common';
import { MulterOptions } from '@nestjs/platform-express/multer/interfaces/multer-options.interface';
import path from 'node:path';

export const MAX_CONTACT_IMPORT_BYTES = 2 * 1024 * 1024;

const CSV_MIME_TYPES = new Set([
  'text/csv',
  'application/csv',
  'application/vnd.ms-excel',
  'text/plain',
]);

export const CONTACT_IMPORT_UPLOAD_OPTIONS: MulterOptions = {
  limits: {
    files: 1,
    fileSize: MAX_CONTACT_IMPORT_BYTES,
    fields: 0,
  },
  fileFilter: (_request, file, callback) => {
    const extension = path.extname(file.originalname).toLowerCase();
    if (
      extension !== '.csv' ||
      !CSV_MIME_TYPES.has(file.mimetype.toLowerCase())
    ) {
      callback(
        new BadRequestException('Only UTF-8 CSV contact files are supported'),
        false,
      );
      return;
    }
    callback(null, true);
  },
};
