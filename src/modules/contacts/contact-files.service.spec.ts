import { ConfigService } from '@nestjs/config';
import { writeFile, unlink } from 'fs/promises';
import os from 'os';
import path from 'path';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { AttachmentDisposition } from '../messages/dto/attachment-download-query.dto';
import { CloudinaryMessageAttachmentStorage } from '../messages/storage/cloudinary-message-attachment.storage';
import { ContactFilesRepository } from './contact-files.repository';
import { ContactFilesService } from './contact-files.service';
import { ContactsService } from './contacts.service';

describe('ContactFilesService', () => {
  const organizationId = 'org-1';
  const userId = 'user-1';
  const contactId = '507f1f77bcf86cd799439011';
  const fileId = '507f191e810c19729de860ea';
  let repository: Record<string, jest.Mock>;
  let contacts: Record<string, jest.Mock>;
  let storage: Record<string, jest.Mock>;
  let audits: Record<string, jest.Mock>;
  let service: ContactFilesService;

  beforeEach(() => {
    repository = {
      createMany: jest.fn(),
      hardDeleteByIds: jest.fn().mockResolvedValue({}),
      list: jest.fn(),
      findWithStorage: jest.fn(),
      markDeletionPending: jest.fn(),
      markDeleted: jest.fn().mockResolvedValue({}),
      markDeleteFailed: jest.fn().mockResolvedValue({}),
    };
    contacts = {
      get: jest.fn().mockResolvedValue({ id: contactId }),
      assertActiveIds: jest.fn().mockResolvedValue([]),
    };
    storage = {
      store: jest.fn(),
      getDownload: jest.fn(),
      delete: jest.fn().mockResolvedValue(undefined),
    };
    audits = { create: jest.fn().mockResolvedValue({}) };
    service = new ContactFilesService(
      repository as unknown as ContactFilesRepository,
      contacts as unknown as ContactsService,
      storage as unknown as CloudinaryMessageAttachmentStorage,
      {
        get: jest.fn((_key, fallback) => fallback),
      } as unknown as ConfigService,
      audits as unknown as AuditLogsService,
    );
  });

  it('returns only a short-lived signed download, never storage credentials', async () => {
    repository.findWithStorage.mockResolvedValue(storedFile());
    storage.getDownload.mockResolvedValue({
      downloadUrl: 'https://signed.example/file',
      expiresAt: new Date('2026-11-12T12:05:00.000Z'),
    });

    const result = await service.download(
      organizationId,
      contactId,
      fileId,
      AttachmentDisposition.ATTACHMENT,
    );

    expect(storage.getDownload).toHaveBeenCalledWith(
      expect.objectContaining({ storageKey: 'private/key' }),
      AttachmentDisposition.ATTACHMENT,
    );
    expect(result).not.toHaveProperty('storageKey');
    expect(result.downloadUrl).toBe('https://signed.example/file');
  });

  it('records retryable cleanup state when provider deletion fails', async () => {
    repository.markDeletionPending.mockResolvedValue(storedFile());
    storage.delete.mockRejectedValue(new Error('provider unavailable'));

    const result = await service.remove(
      organizationId,
      userId,
      contactId,
      fileId,
    );

    expect(repository.markDeleteFailed).toHaveBeenCalledWith(
      fileId,
      'provider unavailable',
    );
    expect(result).toEqual({ fileId, deleted: true, cleanupComplete: false });
  });

  it('rolls back provider assets and partial records when persistence fails', async () => {
    const localPath = path.join(os.tmpdir(), `customer-file-${Date.now()}.pdf`);
    await writeFile(localPath, 'test-pdf');
    storage.store.mockResolvedValue({
      storageProvider: 'CLOUDINARY',
      storageKey: 'private/key',
      storageResourceType: 'image',
      storageDeliveryType: 'authenticated',
      storageFormat: 'pdf',
      sizeBytes: 8,
    });
    repository.createMany.mockRejectedValue(new Error('database unavailable'));

    try {
      await expect(
        service.upload(organizationId, userId, contactId, [
          {
            path: localPath,
            originalname: 'quote.pdf',
            mimetype: 'application/pdf',
            size: 8,
          } as Express.Multer.File,
        ]),
      ).rejects.toThrow('database unavailable');
      expect(repository.hardDeleteByIds).toHaveBeenCalledWith([
        expect.any(String),
      ]);
      expect(storage.delete).toHaveBeenCalledWith(
        expect.objectContaining({ storageKey: 'private/key' }),
      );
    } finally {
      await unlink(localPath).catch(() => undefined);
    }
  });

  function storedFile() {
    return {
      _id: fileId,
      organizationId,
      contactId,
      originalName: 'quote.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 8,
      storageKey: 'private/key',
      storageResourceType: 'image',
      storageDeliveryType: 'authenticated',
      storageFormat: 'pdf',
    };
  }
});
