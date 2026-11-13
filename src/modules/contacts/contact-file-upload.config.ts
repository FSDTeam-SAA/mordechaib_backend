import { BadRequestException } from '@nestjs/common';
import { MulterOptions } from '@nestjs/platform-express/multer/interfaces/multer-options.interface';
import crypto from 'crypto';
import { mkdirSync } from 'fs';
import { diskStorage } from 'multer';
import os from 'os';
import path from 'path';
import { MessageAttachmentCategory } from '../../common/enums/message-attachment-category.enum';
import { resolveAttachmentCategory } from '../messages/message-upload.config';

export const MAX_CUSTOMER_FILES_PER_UPLOAD = 10;
export const MAX_CUSTOMER_FILE_BYTES = 20 * 1024 * 1024;

export function resolveCustomerFileCategory(
  originalName: string,
  mimeType: string,
) {
  const category = resolveAttachmentCategory(originalName, mimeType);
  return category &&
    [
      MessageAttachmentCategory.IMAGE,
      MessageAttachmentCategory.PDF,
      MessageAttachmentCategory.DOCUMENT,
    ].includes(category)
    ? category
    : undefined;
}

const uploadDirectory = path.join(os.tmpdir(), 'noltra-customer-files');
mkdirSync(uploadDirectory, { recursive: true });

export const CUSTOMER_FILE_UPLOAD_OPTIONS: MulterOptions = {
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
    files: MAX_CUSTOMER_FILES_PER_UPLOAD,
    fileSize: MAX_CUSTOMER_FILE_BYTES,
    fields: 2,
  },
  fileFilter: (_request, file, callback) => {
    const category = resolveCustomerFileCategory(
      file.originalname,
      file.mimetype,
    );
    if (!category) {
      callback(
        new BadRequestException(
          `Unsupported customer file: ${path.basename(file.originalname)}`,
        ),
        false,
      );
      return;
    }
    callback(null, true);
  },
};
