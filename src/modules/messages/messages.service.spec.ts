import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { mkdtemp, readFile, writeFile } from 'fs/promises';
import os from 'os';
import path from 'path';
import { MessageAttachmentCategory } from '../../common/enums/message-attachment-category.enum';
import { MessageAttachmentStatus } from '../../common/enums/message-attachment-status.enum';
import { MessageProcessingStatus } from '../../common/enums/message-processing-status.enum';
import { MessageSenderType } from '../../common/enums/message-sender-type.enum';
import { MessageType } from '../../common/enums/message-type.enum';
import { UserRole } from '../../common/enums/user-role.enum';
import { RequestUser } from '../../common/types/request-context.type';
import { ConversationsRepository } from './conversations.repository';
import { MessageAttachmentsRepository } from './message-attachments.repository';
import { MessagesRepository } from './messages.repository';
import { MessagesService } from './messages.service';
import { MessageAttachmentStorage } from './storage/message-attachment-storage.interface';

describe('MessagesService', () => {
  const organizationId = 'org-1';
  const userId = 'user-1';
  const conversationId = 'conversation-1';
  const messageId = '507f1f77bcf86cd799439011';
  const attachmentId = '507f191e810c19729de860ea';

  let conversations: Record<string, jest.Mock>;
  let messages: Record<string, jest.Mock>;
  let attachments: Record<string, jest.Mock>;
  let storage: Record<string, jest.Mock>;
  let service: MessagesService;

  beforeEach(() => {
    conversations = {
      findByOrganization: jest.fn(),
      findOrCreate: jest.fn().mockResolvedValue({ _id: conversationId }),
      recordMessage: jest.fn().mockResolvedValue({ _id: conversationId }),
    };
    messages = {
      findByClientMessageId: jest.fn(),
      create: jest.fn().mockImplementation((input: Record<string, unknown>) =>
        Promise.resolve({
          _id: messageId,
          ...input,
          senderType: MessageSenderType.USER,
          processingStatus: MessageProcessingStatus.NOT_REQUESTED,
          createdAt: new Date('2026-09-04T00:00:00.000Z'),
        }),
      ),
      hardDelete: jest.fn(),
      list: jest.fn(),
      findActiveById: jest.fn(),
      findForDeletion: jest.fn(),
      softDelete: jest.fn(),
    };
    attachments = {
      createMany: jest.fn().mockResolvedValue([]),
      hardDeleteByMessage: jest.fn(),
      findByMessageIds: jest.fn().mockResolvedValue([]),
      findActiveWithStorage: jest.fn(),
      markDeletionPending: jest.fn(),
      findCleanupCandidates: jest.fn().mockResolvedValue([]),
      markDeleted: jest.fn(),
      markDeleteFailed: jest.fn(),
    };
    storage = {
      store: jest.fn(),
      getDownload: jest.fn(),
      delete: jest.fn(),
    };
    service = new MessagesService(
      conversations as unknown as ConversationsRepository,
      messages as unknown as MessagesRepository,
      attachments as unknown as MessageAttachmentsRepository,
      storage as unknown as MessageAttachmentStorage,
    );
  });

  it('creates a text message in the organization singleton conversation', async () => {
    const result = await service.create(organizationId, userId, {
      content: '  hello AI  ',
    });

    expect(conversations.findOrCreate).toHaveBeenCalledWith(
      organizationId,
      userId,
    );
    expect(messages.create).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId,
        conversationId,
        senderId: userId,
        content: 'hello AI',
        type: MessageType.TEXT,
        attachmentCount: 0,
      }),
    );
    expect(storage.store).not.toHaveBeenCalled();
    expect(result).toEqual(
      expect.objectContaining({ id: messageId, content: 'hello AI' }),
    );
  });

  it('returns an existing client message without uploading again', async () => {
    messages.findByClientMessageId.mockResolvedValue({
      _id: messageId,
      organizationId,
      conversationId,
      senderId: userId,
      type: MessageType.TEXT,
      content: 'already sent',
    });

    const result = await service.create(organizationId, userId, {
      clientMessageId: 'df7242be-a892-4f86-a54c-aa622328447a',
      content: 'already sent',
    });

    expect(conversations.findOrCreate).not.toHaveBeenCalled();
    expect(messages.create).not.toHaveBeenCalled();
    expect(storage.store).not.toHaveBeenCalled();
    expect(result).toEqual(expect.objectContaining({ id: messageId }));
  });

  it('stores a mixed message, records its checksum, and removes the temp file', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'messages-test-'));
    const temporaryPath = path.join(directory, 'report.pdf');
    await writeFile(temporaryPath, Buffer.from('%PDF-test'));
    const file = {
      path: temporaryPath,
      originalname: 'report.pdf',
      mimetype: 'application/pdf',
      size: (await readFile(temporaryPath)).byteLength,
    } as Express.Multer.File;
    storage.store.mockResolvedValue({
      storageProvider: 'CLOUDINARY',
      storageKey: 'messages/report',
      storageAssetId: 'asset-1',
      storageResourceType: 'image',
      storageDeliveryType: 'authenticated',
      storageFormat: 'pdf',
      sizeBytes: file.size,
    });
    attachments.createMany.mockImplementation(
      (inputs: Array<Record<string, unknown>>) =>
        Promise.resolve(
          inputs.map((input) => ({
            _id: attachmentId,
            ...input,
            status: MessageAttachmentStatus.ACTIVE,
            processingStatus: MessageProcessingStatus.NOT_REQUESTED,
          })),
        ),
    );

    const result = await service.create(
      organizationId,
      userId,
      { content: 'analyze this' },
      [file],
    );

    expect(storage.store).toHaveBeenCalledWith(
      expect.objectContaining({
        category: MessageAttachmentCategory.PDF,
        originalName: 'report.pdf',
      }),
    );
    expect(attachments.createMany).toHaveBeenCalledWith([
      expect.objectContaining({
        checksumSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
      }),
    ]);
    expect(result).toEqual(
      expect.objectContaining({ type: MessageType.MIXED, attachmentCount: 1 }),
    );
    await expect(readFile(temporaryPath)).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });

  it('rejects empty messages before creating a conversation', async () => {
    await expect(
      service.create(organizationId, userId, { content: '   ' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(conversations.findOrCreate).not.toHaveBeenCalled();
  });

  it('keeps list attachments grouped under their messages', async () => {
    conversations.findByOrganization.mockResolvedValue({ _id: conversationId });
    messages.list.mockResolvedValue({
      items: [
        {
          _id: messageId,
          organizationId,
          conversationId,
          senderId: userId,
          type: MessageType.ATTACHMENT,
          attachmentCount: 1,
        },
      ],
      total: 1,
    });
    attachments.findByMessageIds.mockResolvedValue([
      {
        _id: attachmentId,
        messageId,
        category: MessageAttachmentCategory.IMAGE,
        originalName: 'photo.jpg',
      },
    ]);

    const result = await service.list(organizationId, { page: 1, limit: 30 });

    expect(attachments.findByMessageIds).toHaveBeenCalledWith(organizationId, [
      messageId,
    ]);
    expect(result.items[0].attachments).toEqual([
      expect.objectContaining({ id: attachmentId, originalName: 'photo.jpg' }),
    ]);
  });

  it('allows only the creator, owner, or admin to delete a message', async () => {
    messages.findForDeletion.mockResolvedValue({
      _id: messageId,
      senderId: 'different-user',
    });
    const member = {
      id: userId,
      role: UserRole.MEMBER,
    } as RequestUser;

    await expect(
      service.delete(organizationId, member, messageId),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(messages.softDelete).not.toHaveBeenCalled();
  });

  it('soft-deletes first and records retryable attachment cleanup failures', async () => {
    messages.findForDeletion.mockResolvedValue({
      _id: messageId,
      senderId: 'different-user',
    });
    attachments.findCleanupCandidates.mockResolvedValue([
      {
        _id: attachmentId,
        storageKey: 'messages/photo',
        storageAssetId: 'asset-1',
        storageResourceType: 'image',
        storageDeliveryType: 'authenticated',
        storageFormat: 'jpg',
      },
    ]);
    storage.delete.mockRejectedValue(new Error('provider unavailable'));
    const owner = { id: userId, role: UserRole.OWNER } as RequestUser;

    await expect(
      service.delete(organizationId, owner, messageId),
    ).resolves.toEqual({ messageId, deleted: true, cleanupComplete: false });
    expect(messages.softDelete).toHaveBeenCalledWith(
      organizationId,
      messageId,
      userId,
    );
    expect(attachments.markDeleteFailed).toHaveBeenCalledWith(
      attachmentId,
      'provider unavailable',
    );
  });
});
