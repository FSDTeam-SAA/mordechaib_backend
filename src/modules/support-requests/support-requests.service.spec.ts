import { NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Types } from 'mongoose';
import {
  SupportAttachmentStatus,
  SupportRequestCategory,
  SupportRequestStatus,
} from '../../common/enums/support-request.enum';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { AttachmentDisposition } from '../messages/dto/attachment-download-query.dto';
import { CloudinaryMessageAttachmentStorage } from '../messages/storage/cloudinary-message-attachment.storage';
import { SupportRequestsRepository } from './support-requests.repository';
import { SupportRequestsService } from './support-requests.service';

describe('SupportRequestsService', () => {
  const requestId = new Types.ObjectId().toHexString();
  const attachmentId = new Types.ObjectId().toHexString();
  const baseRequest = {
    _id: requestId,
    ticketId: 'SUP-20260923-ABCDEF12',
    organizationId: 'org-1',
    createdByUserId: 'user-1',
    category: SupportRequestCategory.TECHNICAL,
    subject: 'Unable to load a report',
    description: 'The report does not load after selecting a date range.',
    status: SupportRequestStatus.OPEN,
    attachmentCount: 0,
    attachments: [],
    createdAt: new Date('2026-09-23T10:00:00.000Z'),
    updatedAt: new Date('2026-09-23T10:00:00.000Z'),
  };

  const repository = {
    create: jest.fn(),
    listForUser: jest.fn(),
    findForUser: jest.fn(),
    findAttachmentForUser: jest.fn(),
    softDelete: jest.fn(),
    markAttachmentDeleted: jest.fn(),
    markAttachmentDeleteFailed: jest.fn(),
    listForAdmin: jest.fn(),
    findForAdmin: jest.fn(),
    findAttachmentForAdmin: jest.fn(),
    updateStatus: jest.fn(),
  };
  const storage = {
    store: jest.fn(),
    getDownload: jest.fn(),
    delete: jest.fn(),
  };
  const config = {
    get: jest.fn((_key: string, fallback: unknown) => fallback),
  };
  const audits = { create: jest.fn() };

  let service: SupportRequestsService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new SupportRequestsService(
      repository as unknown as SupportRequestsRepository,
      storage as unknown as CloudinaryMessageAttachmentStorage,
      config as unknown as ConfigService,
      audits as unknown as AuditLogsService,
    );
  });

  it('creates a user-scoped request without exposing storage metadata', async () => {
    repository.create.mockResolvedValue(baseRequest);

    const result = await service.create(
      'org-1',
      'user-1',
      {
        category: SupportRequestCategory.TECHNICAL,
        subject: baseRequest.subject,
        description: baseRequest.description,
      },
      [],
    );

    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'org-1',
        createdByUserId: 'user-1',
        status: SupportRequestStatus.OPEN,
        attachmentCount: 0,
      }),
    );
    expect(result).toEqual(
      expect.objectContaining({
        id: requestId,
        ticketId: baseRequest.ticketId,
        attachments: [],
      }),
    );
    expect(audits.create).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'SUPPORT_REQUEST_CREATED' }),
    );
  });

  it('always passes organization and user scope to the recent list', async () => {
    repository.listForUser.mockResolvedValue({ items: [], total: 0 });

    const result = await service.listForUser('org-1', 'user-1', {
      page: 1,
      limit: 20,
    });

    expect(repository.listForUser).toHaveBeenCalledWith(
      'org-1',
      'user-1',
      expect.objectContaining({ page: 1, limit: 20 }),
    );
    expect(result.pagination).toEqual({
      page: 1,
      limit: 20,
      total: 0,
      pages: 0,
    });
  });

  it('returns a signed URL only for an attachment found in the user scope', async () => {
    repository.findAttachmentForUser.mockResolvedValue({
      ...baseRequest,
      attachmentCount: 1,
      attachments: [
        {
          _id: attachmentId,
          originalName: 'error.png',
          mimeType: 'image/png',
          status: SupportAttachmentStatus.ACTIVE,
          storageKey: 'private/key',
          storageResourceType: 'image',
          storageDeliveryType: 'authenticated',
          storageFormat: 'png',
        },
      ],
    });
    storage.getDownload.mockResolvedValue({
      downloadUrl: 'https://files.example/signed',
      expiresAt: new Date('2026-09-23T10:05:00.000Z'),
    });

    const result = await service.getAttachmentForUser(
      'org-1',
      'user-1',
      requestId,
      attachmentId,
      AttachmentDisposition.INLINE,
    );

    expect(repository.findAttachmentForUser).toHaveBeenCalledWith(
      'org-1',
      'user-1',
      requestId,
      attachmentId,
    );
    expect(result.downloadUrl).toBe('https://files.example/signed');
  });

  it('soft-deletes first and records a failed attachment cleanup', async () => {
    repository.softDelete.mockResolvedValue({
      ...baseRequest,
      attachments: [
        {
          _id: attachmentId,
          status: SupportAttachmentStatus.DELETION_PENDING,
          storageKey: 'private/key',
          storageResourceType: 'image',
          storageDeliveryType: 'authenticated',
          storageFormat: 'png',
        },
      ],
    });
    storage.delete.mockRejectedValue(new Error('provider unavailable'));

    const result = await service.remove('org-1', 'user-1', requestId);

    expect(repository.markAttachmentDeleteFailed).toHaveBeenCalledWith(
      requestId,
      attachmentId,
      'provider unavailable',
    );
    expect(result).toEqual({
      requestId,
      deleted: true,
      cleanupComplete: false,
    });
  });

  it('rejects status updates for a missing request', async () => {
    repository.updateStatus.mockResolvedValue(null);

    await expect(
      service.updateStatus(
        requestId,
        { status: SupportRequestStatus.RESOLVED },
        'platform-admin-1',
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
