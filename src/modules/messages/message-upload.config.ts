import { BadRequestException } from '@nestjs/common';
import { MulterOptions } from '@nestjs/platform-express/multer/interfaces/multer-options.interface';
import crypto from 'crypto';
import { mkdirSync } from 'fs';
import { diskStorage } from 'multer';
import os from 'os';
import path from 'path';
import { MessageAttachmentCategory } from '../../common/enums/message-attachment-category.enum';

export const MAX_MESSAGE_ATTACHMENTS = 10;
const MB = 1024 * 1024;
export const MESSAGE_ATTACHMENT_SIZE_LIMITS: Record<
  MessageAttachmentCategory,
  number
> = {
  [MessageAttachmentCategory.IMAGE]: 20 * MB,
  [MessageAttachmentCategory.PDF]: 20 * MB,
  [MessageAttachmentCategory.DOCUMENT]: 20 * MB,
  [MessageAttachmentCategory.AUDIO]: 50 * MB,
  [MessageAttachmentCategory.VIDEO]: 200 * MB,
};

const EXTENSIONS: Record<MessageAttachmentCategory, Set<string>> = {
  [MessageAttachmentCategory.IMAGE]: new Set([
    '.jpg',
    '.jpeg',
    '.png',
    '.gif',
    '.webp',
    '.heic',
  ]),
  [MessageAttachmentCategory.AUDIO]: new Set([
    '.mp3',
    '.wav',
    '.ogg',
    '.m4a',
    '.aac',
    '.flac',
    '.webm',
  ]),
  [MessageAttachmentCategory.VIDEO]: new Set([
    '.mp4',
    '.mov',
    '.webm',
    '.mpeg',
    '.mpg',
    '.avi',
  ]),
  [MessageAttachmentCategory.PDF]: new Set(['.pdf']),
  [MessageAttachmentCategory.DOCUMENT]: new Set([
    '.txt',
    '.csv',
    '.doc',
    '.docx',
    '.xls',
    '.xlsx',
    '.ppt',
    '.pptx',
    '.rtf',
  ]),
};

const MIME_PREFIX: Partial<Record<MessageAttachmentCategory, string>> = {
  [MessageAttachmentCategory.IMAGE]: 'image/',
  [MessageAttachmentCategory.AUDIO]: 'audio/',
  [MessageAttachmentCategory.VIDEO]: 'video/',
};

const DOCUMENT_MIMES = new Set([
  'text/plain',
  'text/csv',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/rtf',
  'text/rtf',
  'application/octet-stream',
]);

export function resolveAttachmentCategory(
  originalName: string,
  mimeType: string,
): MessageAttachmentCategory | undefined {
  const extension = path.extname(originalName).toLowerCase();
  const normalizedMime = mimeType.toLowerCase();
  for (const category of Object.values(MessageAttachmentCategory)) {
    if (!EXTENSIONS[category].has(extension)) continue;
    if (
      category === MessageAttachmentCategory.PDF &&
      normalizedMime === 'application/pdf'
    ) {
      return category;
    }
    if (
      category === MessageAttachmentCategory.DOCUMENT &&
      DOCUMENT_MIMES.has(normalizedMime)
    ) {
      return category;
    }
    const prefix = MIME_PREFIX[category];
    if (prefix && normalizedMime.startsWith(prefix)) return category;
  }
  return undefined;
}

const uploadDirectory = path.join(os.tmpdir(), 'noltra-message-uploads');
mkdirSync(uploadDirectory, { recursive: true });

export const MESSAGE_UPLOAD_OPTIONS: MulterOptions = {
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
    files: MAX_MESSAGE_ATTACHMENTS,
    fileSize: MESSAGE_ATTACHMENT_SIZE_LIMITS[MessageAttachmentCategory.VIDEO],
    fields: 5,
  },
  fileFilter: (_request, file, callback) => {
    if (!resolveAttachmentCategory(file.originalname, file.mimetype)) {
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
