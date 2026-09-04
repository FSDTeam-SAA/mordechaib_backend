import { Module } from '@nestjs/common';
import { ConversationsRepository } from './conversations.repository';
import { MessageAttachmentsRepository } from './message-attachments.repository';
import { MessagesController } from './messages.controller';
import { MessagesRepository } from './messages.repository';
import { MessagesService } from './messages.service';
import { CloudinaryMessageAttachmentStorage } from './storage/cloudinary-message-attachment.storage';
import { MESSAGE_ATTACHMENT_STORAGE } from './storage/message-attachment-storage.interface';
import { TemporaryUploadCleanupInterceptor } from './temporary-upload-cleanup.interceptor';

@Module({
  controllers: [MessagesController],
  providers: [
    MessagesService,
    ConversationsRepository,
    MessagesRepository,
    MessageAttachmentsRepository,
    CloudinaryMessageAttachmentStorage,
    {
      provide: MESSAGE_ATTACHMENT_STORAGE,
      useExisting: CloudinaryMessageAttachmentStorage,
    },
    TemporaryUploadCleanupInterceptor,
  ],
  exports: [MessagesService],
})
export class MessagesModule {}
