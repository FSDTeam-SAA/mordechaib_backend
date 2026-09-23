import { forwardRef, Module } from '@nestjs/common';
import { AiIntegrationModule } from '../ai-integration/ai-integration.module';
import { ConversationsRepository } from './conversations.repository';
import { MessageAttachmentsRepository } from './message-attachments.repository';
import { MessagesController } from './messages.controller';
import { MessagesRepository } from './messages.repository';
import { MessagesService } from './messages.service';
import { CloudinaryMessageAttachmentStorage } from './storage/cloudinary-message-attachment.storage';
import { MESSAGE_ATTACHMENT_STORAGE } from './storage/message-attachment-storage.interface';
import { TemporaryUploadCleanupInterceptor } from './temporary-upload-cleanup.interceptor';

@Module({
  imports: [forwardRef(() => AiIntegrationModule)],
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
  exports: [MessagesService, CloudinaryMessageAttachmentStorage],
})
export class MessagesModule {}
