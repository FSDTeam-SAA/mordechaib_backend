import { BadRequestException, PayloadTooLargeException } from '@nestjs/common';
import path from 'node:path';
import { AiStreamAttachment } from '../ai-integration/ai-stream-attachment';

export const MAX_AI_CHAT_ATTACHMENTS = 5;
export const MAX_AI_CHAT_UPLOAD_BYTES = 20 * 1024 * 1024;

const SUPPORTED_TYPES = new Map<string, Set<string>>([
  ['.pdf', new Set(['application/pdf'])],
  [
    '.docx',
    new Set([
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ]),
  ],
  ['.png', new Set(['image/png'])],
  ['.jpg', new Set(['image/jpeg'])],
  ['.jpeg', new Set(['image/jpeg'])],
  ['.webp', new Set(['image/webp'])],
  ['.gif', new Set(['image/gif'])],
]);

export function validateAiChatUploads(
  files: Express.Multer.File[] = [],
): AiStreamAttachment[] {
  if (files.length > MAX_AI_CHAT_ATTACHMENTS) {
    throw new BadRequestException(
      `AI chat supports at most ${MAX_AI_CHAT_ATTACHMENTS} attachments`,
    );
  }
  const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
  if (totalBytes > MAX_AI_CHAT_UPLOAD_BYTES) {
    throw new PayloadTooLargeException(
      'AI chat attachments exceed the 20 MB request limit',
    );
  }
  return files.map((file) => {
    const originalName = path.basename(file.originalname).slice(0, 255);
    const extension = path.extname(originalName).toLowerCase();
    const mimeType = file.mimetype.toLowerCase();
    if (!SUPPORTED_TYPES.get(extension)?.has(mimeType)) {
      throw new BadRequestException(
        `AI chat does not support attachment: ${originalName}`,
      );
    }
    if (!file.path) {
      throw new BadRequestException(
        `AI chat attachment is missing temporary storage: ${originalName}`,
      );
    }
    return {
      localPath: file.path,
      originalName,
      mimeType,
      sizeBytes: file.size,
    };
  });
}
