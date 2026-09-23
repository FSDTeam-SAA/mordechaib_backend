import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
  forwardRef,
} from '@nestjs/common';
import crypto from 'crypto';
import { createReadStream } from 'fs';
import { readFile, unlink } from 'fs/promises';
import path from 'path';
import { Types } from 'mongoose';
import { MessageAttachmentCategory } from '../../common/enums/message-attachment-category.enum';
import { MessageProcessingStatus } from '../../common/enums/message-processing-status.enum';
import { MessageType } from '../../common/enums/message-type.enum';
import { UserRole } from '../../common/enums/user-role.enum';
import { RequestUser } from '../../common/types/request-context.type';
import { AttachmentDisposition } from './dto/attachment-download-query.dto';
import { CreateConversationDto } from './dto/create-conversation.dto';
import { CreateMessageDto } from './dto/create-message.dto';
import { ListConversationsQueryDto } from './dto/list-conversations-query.dto';
import { ListMessagesQueryDto } from './dto/list-messages-query.dto';
import { ConversationsRepository } from './conversations.repository';
import { MessageAttachmentsRepository } from './message-attachments.repository';
import {
  MESSAGE_ATTACHMENT_SIZE_LIMITS,
  resolveAttachmentCategory,
} from './message-upload.config';
import { MessagesRepository } from './messages.repository';
import { AiJobsQueue } from '../ai-integration/ai-jobs.queue';
import {
  MESSAGE_ATTACHMENT_STORAGE,
  MessageAttachmentStorage,
  MessageAttachmentStorageReference,
  StoredMessageAttachment,
} from './storage/message-attachment-storage.interface';

type UploadedAttachment = {
  category: MessageAttachmentCategory;
  originalName: string;
  mimeType: string;
  checksumSha256: string;
  processingStatus: MessageProcessingStatus;
  extractedText?: string;
  processingError?: string;
  stored: StoredMessageAttachment;
};

const MAX_EXTRACTED_TEXT_CHARACTERS = 100_000;

@Injectable()
export class MessagesService {
  private readonly logger = new Logger(MessagesService.name);

  constructor(
    private readonly conversations: ConversationsRepository,
    private readonly messages: MessagesRepository,
    private readonly attachments: MessageAttachmentsRepository,
    @Inject(MESSAGE_ATTACHMENT_STORAGE)
    private readonly storage: MessageAttachmentStorage,
    @Optional()
    @Inject(forwardRef(() => AiJobsQueue))
    private readonly aiJobs?: AiJobsQueue,
  ) {}

  getConversation(organizationId: string, userId: string) {
    return this.conversations.findLatest(organizationId, userId);
  }

  createConversation(
    organizationId: string,
    userId: string,
    input: CreateConversationDto,
  ) {
    return this.conversations.create(
      organizationId,
      userId,
      input.title || 'New Chat',
    );
  }

  async listConversations(
    organizationId: string,
    userId: string,
    query: ListConversationsQueryDto,
  ) {
    const result = await this.conversations.list(
      organizationId,
      userId,
      query.page,
      query.limit,
      query,
    );
    return {
      items: result.items,
      pagination: {
        page: query.page,
        limit: query.limit,
        total: result.total,
        pages: Math.ceil(result.total / query.limit),
      },
    };
  }

  async create(
    organizationId: string,
    userId: string,
    input: CreateMessageDto,
    files: Express.Multer.File[] = [],
  ) {
    const content = input.content?.trim();
    if (!content && files.length === 0) {
      throw new BadRequestException(
        'A message must contain text or at least one attachment',
      );
    }

    try {
      if (input.clientMessageId) {
        const existing = await this.messages.findByClientMessageId(
          organizationId,
          input.clientMessageId,
        );
        if (existing) return this.withAttachments(organizationId, existing);
      }

      const validatedFiles = files.map((file) => this.validateFile(file));
      const conversation = input.conversationId
        ? await this.conversations.findById(
            organizationId,
            input.conversationId,
            userId,
          )
        : await this.conversations.findOrCreate(organizationId, userId);
      if (!conversation) throw new NotFoundException('Conversation not found');
      const conversationId = String(conversation._id);
      const uploaded: UploadedAttachment[] = [];
      let messageId: string | undefined;

      try {
        for (const { file, category } of validatedFiles) {
          const originalName = this.safeOriginalName(file.originalname);
          const checksumSha256 = await this.checksum(file.path);
          const extraction = await this.extractPlainText(file);
          const stored = await this.storage.store({
            organizationId,
            conversationId,
            uploadId: crypto.randomUUID(),
            localPath: file.path,
            originalName,
            mimeType: file.mimetype,
            sizeBytes: file.size,
            category,
          });
          uploaded.push({
            category,
            originalName,
            mimeType: file.mimetype,
            checksumSha256,
            ...extraction,
            stored,
          });
        }

        const message = await this.messages.create({
          organizationId,
          conversationId,
          senderId: userId,
          clientMessageId: input.clientMessageId,
          content,
          type: this.messageType(Boolean(content), uploaded.length),
          attachmentCount: uploaded.length,
        });
        messageId = String(message._id);
        const messageAttachments = await this.attachments.createMany(
          uploaded.map((attachment) => ({
            organizationId,
            messageId: messageId!,
            category: attachment.category,
            originalName: attachment.originalName,
            mimeType: attachment.mimeType,
            checksumSha256: attachment.checksumSha256,
            processingStatus: attachment.processingStatus,
            extractedText: attachment.extractedText,
            processingError: attachment.processingError,
            ...attachment.stored,
          })),
        );
        await this.conversations.recordMessage(
          organizationId,
          conversationId,
          new Date(),
        );
        const response = this.publicMessage(message, messageAttachments);
        if (this.aiJobs) {
          try {
            const queued = await this.aiJobs.enqueueMessageAnalysis({
              organizationId,
              messageId: messageId!,
            });
            if (!queued.queued) {
              await this.messages
                .updateProcessingStatus(
                  organizationId,
                  messageId!,
                  MessageProcessingStatus.NOT_REQUESTED,
                )
                .catch(() => undefined);
            }
          } catch (error) {
            const messageError =
              error instanceof Error ? error.message : 'AI queue unavailable';
            await this.messages
              .updateProcessingStatus(
                organizationId,
                messageId!,
                MessageProcessingStatus.FAILED,
                messageError,
              )
              .catch(() => undefined);
            this.logger.warn(
              `Unable to enqueue AI analysis for message ${messageId}: ${messageError}`,
            );
          }
        }
        return response;
      } catch (error) {
        if (messageId) {
          await Promise.allSettled([
            this.attachments.hardDeleteByMessage(messageId),
            this.messages.hardDelete(messageId),
          ]);
        }
        await this.cleanupStored(uploaded);
        if (this.isDuplicateKey(error) && input.clientMessageId) {
          const existing = await this.messages.findByClientMessageId(
            organizationId,
            input.clientMessageId,
          );
          if (existing) return this.withAttachments(organizationId, existing);
        }
        throw error;
      }
    } finally {
      await Promise.allSettled(
        files
          .filter((file) => Boolean(file.path))
          .map((file) => unlink(file.path)),
      );
    }
  }

  async list(
    organizationId: string,
    userId: string,
    query: ListMessagesQueryDto,
  ) {
    const conversation = query.conversationId
      ? await this.conversations.findById(
          organizationId,
          query.conversationId,
          userId,
        )
      : await this.conversations.findLatest(organizationId, userId);
    if (!conversation) {
      return {
        conversation: null,
        items: [],
        pagination: {
          page: query.page,
          limit: query.limit,
          total: 0,
          pages: 0,
        },
      };
    }
    const result = await this.messages.list(
      organizationId,
      String(conversation._id),
      query.page,
      query.limit,
    );
    const messageIds = result.items.map((message) => String(message._id));
    const attachments = await this.attachments.findByMessageIds(
      organizationId,
      messageIds,
    );
    const grouped = new Map<string, typeof attachments>();
    for (const attachment of attachments) {
      const current = grouped.get(attachment.messageId) ?? [];
      current.push(attachment);
      grouped.set(attachment.messageId, current);
    }
    return {
      conversation,
      items: result.items.map((message) =>
        this.publicMessage(message, grouped.get(String(message._id)) ?? []),
      ),
      pagination: {
        page: query.page,
        limit: query.limit,
        total: result.total,
        pages: Math.ceil(result.total / query.limit),
      },
    };
  }

  async get(organizationId: string, actor: RequestUser, messageId: string) {
    this.assertObjectId(messageId, 'messageId');
    const message = await this.messages.findActiveById(
      organizationId,
      messageId,
    );
    if (!message) throw new NotFoundException('Message not found');
    await this.assertConversationAccess(
      organizationId,
      message.conversationId,
      actor,
    );
    return this.withAttachments(organizationId, message);
  }

  async getAttachmentDownload(
    organizationId: string,
    actor: RequestUser,
    messageId: string,
    attachmentId: string,
    disposition: AttachmentDisposition,
  ) {
    this.assertObjectId(messageId, 'messageId');
    this.assertObjectId(attachmentId, 'attachmentId');
    const message = await this.messages.findActiveById(
      organizationId,
      messageId,
    );
    if (!message) throw new NotFoundException('Message not found');
    await this.assertConversationAccess(
      organizationId,
      message.conversationId,
      actor,
    );
    const attachment = await this.attachments.findActiveWithStorage(
      organizationId,
      messageId,
      attachmentId,
    );
    if (!attachment) throw new NotFoundException('Attachment not found');
    const { downloadUrl, expiresAt } = await this.storage.getDownload(
      this.storageReference(attachment),
      disposition,
    );
    return {
      attachmentId: String(attachment._id),
      originalName: attachment.originalName,
      mimeType: attachment.mimeType,
      downloadUrl,
      expiresAt,
    };
  }

  async delete(organizationId: string, actor: RequestUser, messageId: string) {
    this.assertObjectId(messageId, 'messageId');
    const message = await this.messages.findForDeletion(
      organizationId,
      messageId,
    );
    if (!message) throw new NotFoundException('Message not found');
    if (
      message.senderId !== actor.id &&
      ![UserRole.OWNER, UserRole.ADMIN].includes(actor.role)
    ) {
      throw new ForbiddenException(
        'Only the message creator, owner, or admin can delete this message',
      );
    }

    if (!message.deletedAt) {
      await this.messages.softDelete(organizationId, messageId, actor.id);
    }
    await this.attachments.markDeletionPending(organizationId, messageId);
    const candidates = await this.attachments.findCleanupCandidates(
      organizationId,
      messageId,
    );
    let cleanupComplete = true;
    for (const attachment of candidates) {
      try {
        await this.storage.delete(this.storageReference(attachment));
        await this.attachments.markDeleted(String(attachment._id));
      } catch (error) {
        cleanupComplete = false;
        const errorMessage =
          error instanceof Error ? error.message : 'Storage cleanup failed';
        await this.attachments.markDeleteFailed(
          String(attachment._id),
          errorMessage,
        );
        this.logger.warn(
          `Attachment cleanup failed for ${String(attachment._id)}: ${errorMessage}`,
        );
      }
    }
    return { messageId, deleted: true, cleanupComplete };
  }

  private async withAttachments(
    organizationId: string,
    message: { _id: unknown },
  ) {
    const attachments = await this.attachments.findByMessageIds(
      organizationId,
      [String(message._id)],
    );
    return this.publicMessage(message, attachments);
  }

  private publicMessage(
    message: object & { _id: unknown },
    attachments: Array<object & { _id: unknown }>,
  ) {
    const messageData = message as unknown as Record<string, unknown>;
    return {
      id: String(message._id),
      organizationId: messageData.organizationId,
      conversationId: messageData.conversationId,
      senderId: messageData.senderId,
      senderType: messageData.senderType,
      clientMessageId: messageData.clientMessageId,
      aiResponseId: messageData.aiResponseId,
      type: messageData.type,
      content: messageData.content,
      attachmentCount: messageData.attachmentCount,
      processingStatus: messageData.processingStatus,
      sourceMessageId: messageData.sourceMessageId,
      agentId: messageData.agentId,
      agentName: messageData.agentName,
      agentType: messageData.agentType,
      agentImageUrl: messageData.agentImageUrl,
      agentRunId: messageData.agentRunId,
      emailDraftId: messageData.emailDraftId,
      createdAt: messageData.createdAt,
      updatedAt: messageData.updatedAt,
      attachments: attachments.map((attachment) => {
        const attachmentData = attachment as unknown as Record<string, unknown>;
        return {
          id: String(attachment._id),
          category: attachmentData.category,
          originalName: attachmentData.originalName,
          mimeType: attachmentData.mimeType,
          sizeBytes: attachmentData.sizeBytes,
          checksumSha256: attachmentData.checksumSha256,
          status: attachmentData.status,
          processingStatus: attachmentData.processingStatus,
          processingError: attachmentData.processingError,
          createdAt: attachmentData.createdAt,
        };
      }),
    };
  }

  private validateFile(file: Express.Multer.File) {
    const category = resolveAttachmentCategory(
      file.originalname,
      file.mimetype,
    );
    if (!category) {
      throw new BadRequestException(
        `Unsupported attachment type: ${this.safeOriginalName(file.originalname)}`,
      );
    }
    if (!file.path) {
      throw new BadRequestException(
        'Attachment upload was not buffered safely',
      );
    }
    if (file.size <= 0) {
      throw new BadRequestException('Empty attachments are not allowed');
    }
    if (file.size > MESSAGE_ATTACHMENT_SIZE_LIMITS[category]) {
      throw new BadRequestException(
        `${category.toLowerCase()} attachment exceeds its configured size limit`,
      );
    }
    return { file, category };
  }

  private messageType(hasContent: boolean, attachmentCount: number) {
    if (hasContent && attachmentCount > 0) return MessageType.MIXED;
    if (attachmentCount > 0) return MessageType.ATTACHMENT;
    return MessageType.TEXT;
  }

  private safeOriginalName(originalName: string) {
    const safe = Array.from(path.basename(originalName))
      .filter((character) => {
        const code = character.charCodeAt(0);
        return code >= 32 && code !== 127;
      })
      .join('');
    return (safe || 'attachment').slice(0, 255);
  }

  private checksum(filePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const hash = crypto.createHash('sha256');
      const stream = createReadStream(filePath);
      stream.on('error', reject);
      stream.on('data', (chunk) => hash.update(chunk));
      stream.on('end', () => resolve(hash.digest('hex')));
    });
  }

  private async extractPlainText(file: Express.Multer.File): Promise<{
    processingStatus: MessageProcessingStatus;
    extractedText?: string;
    processingError?: string;
  }> {
    if (!['text/plain', 'text/csv'].includes(file.mimetype.toLowerCase())) {
      return { processingStatus: MessageProcessingStatus.NOT_REQUESTED };
    }
    try {
      const content = (await readFile(file.path, 'utf8'))
        .replace(/\0/g, '')
        .slice(0, MAX_EXTRACTED_TEXT_CHARACTERS)
        .trim();
      return {
        processingStatus: MessageProcessingStatus.COMPLETED,
        ...(content ? { extractedText: content } : {}),
      };
    } catch (error) {
      return {
        processingStatus: MessageProcessingStatus.FAILED,
        processingError: (error instanceof Error
          ? error.message
          : 'Text extraction failed'
        ).slice(0, 500),
      };
    }
  }

  private async cleanupStored(attachments: UploadedAttachment[]) {
    const results = await Promise.allSettled(
      attachments.map((attachment) =>
        this.storage.delete(this.storageReference(attachment.stored)),
      ),
    );
    results.forEach((result, index) => {
      if (result.status === 'rejected') {
        this.logger.error(
          `Unable to roll back stored message attachment ${attachments[index].stored.storageKey}`,
        );
      }
    });
  }

  private storageReference(
    value: MessageAttachmentStorageReference,
  ): MessageAttachmentStorageReference {
    return {
      storageKey: value.storageKey,
      storageAssetId: value.storageAssetId,
      storageResourceType: value.storageResourceType,
      storageDeliveryType: value.storageDeliveryType,
      storageFormat: value.storageFormat,
    };
  }

  private assertObjectId(value: string, name: string) {
    if (!Types.ObjectId.isValid(value)) {
      throw new BadRequestException(`${name} must be a valid MongoDB id`);
    }
  }

  private async assertConversationAccess(
    organizationId: string,
    conversationId: string,
    actor: RequestUser,
  ) {
    if ([UserRole.OWNER, UserRole.ADMIN].includes(actor.role)) return;
    const conversation = await this.conversations.findById(
      organizationId,
      conversationId,
      actor.id,
    );
    if (!conversation) throw new NotFoundException('Message not found');
  }

  private isDuplicateKey(error: unknown) {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 11000
    );
  }
}
