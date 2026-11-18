import { ConflictException } from '@nestjs/common';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { ContactsRepository } from './contacts.repository';
import { ContactsService } from './contacts.service';
import { CustomerLeadStatus } from '../../common/enums/customer-lead-status.enum';
import { ContactAvatarStorageService } from './contact-avatar-storage.service';
import { CustomerContactStatus } from '../../common/enums/customer-contact-status.enum';

describe('ContactsService', () => {
  let repository: Record<string, jest.Mock>;
  let avatarStorage: Record<string, jest.Mock>;
  let service: ContactsService;

  beforeEach(() => {
    repository = {
      create: jest.fn(),
      createMany: jest.fn(),
      findDuplicate: jest.fn().mockResolvedValue(null),
      findDuplicatesMany: jest.fn().mockResolvedValue([]),
      findByIds: jest.fn(),
      findById: jest.fn(),
      findActiveByIds: jest.fn(),
      list: jest.fn(),
      update: jest.fn(),
      archive: jest.fn(),
    };
    avatarStorage = {
      upload: jest.fn(),
      delete: jest.fn().mockResolvedValue(undefined),
    };
    service = new ContactsService(
      repository as unknown as ContactsRepository,
      { create: jest.fn() } as unknown as AuditLogsService,
      avatarStorage as unknown as ContactAvatarStorageService,
    );
  });

  it('creates an organization-scoped contact with a normalized phone', async () => {
    repository.create.mockImplementation(async (input) => ({
      ...input,
      _id: '66cc9bdfa847ea856c7b41d2',
    }));

    const result = await service.create('org-1', 'user-1', {
      name: 'Tahid Rahman',
      email: 'tahid@example.com',
      phone: '+880 (18) 1234-5678',
    });

    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'org-1',
        createdByUserId: 'user-1',
        phone: '+8801812345678',
      }),
    );
    expect(result).toEqual(
      expect.objectContaining({
        id: '66cc9bdfa847ea856c7b41d2',
        phone: '+8801812345678',
      }),
    );
  });

  it('rejects an active duplicate email or phone', async () => {
    repository.findDuplicate.mockResolvedValue({ _id: 'duplicate' });

    await expect(
      service.create('org-1', 'user-1', {
        name: 'Duplicate',
        email: 'duplicate@example.com',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('preserves extended customer profile fields and supplies a legacy lead-status default', async () => {
    repository.create.mockImplementation(async (input) => ({
      ...input,
      _id: '66cc9bdfa847ea856c7b41d2',
    }));

    const result = await service.create('org-1', 'user-1', {
      name: 'Mike Johnson',
      email: 'mike@example.com',
      avatarUrl: 'https://example.com/mike.png',
      location: 'New York, USA',
      website: 'https://example.com',
      linkedinUrl: 'https://www.linkedin.com/in/mike',
    });

    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        avatarUrl: 'https://example.com/mike.png',
        location: 'New York, USA',
        website: 'https://example.com',
        linkedinUrl: 'https://www.linkedin.com/in/mike',
      }),
    );
    expect(result).toEqual(
      expect.objectContaining({ leadStatus: CustomerLeadStatus.NEW }),
    );
  });

  it('maps a duplicate-key race to a conflict response', async () => {
    repository.create.mockRejectedValue({ code: 11000 });

    await expect(
      service.create('org-1', 'user-1', {
        name: 'Concurrent duplicate',
        email: 'duplicate@example.com',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('uploads and persists an avatar while creating a contact', async () => {
    const avatarUrl =
      'https://res.cloudinary.com/demo/image/upload/customer.png';
    avatarStorage.upload.mockResolvedValue(avatarUrl);
    repository.create.mockImplementation(async (input) => ({ ...input }));
    const avatar = imageUpload();

    const result = await service.create(
      'org-1',
      'user-1',
      { name: 'Avatar Customer', email: 'avatar@example.com' },
      avatar,
    );

    const contactId = String(repository.create.mock.calls[0][0]._id);
    expect(avatarStorage.upload).toHaveBeenCalledWith(
      'org-1',
      contactId,
      avatar,
    );
    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({ avatarUrl }),
    );
    expect(result).toEqual(expect.objectContaining({ avatarUrl }));
  });

  it('removes a newly uploaded avatar if contact creation fails', async () => {
    avatarStorage.upload.mockResolvedValue(
      'https://res.cloudinary.com/demo/image/upload/customer.png',
    );
    repository.create.mockRejectedValue(new Error('database unavailable'));

    await expect(
      service.create(
        'org-1',
        'user-1',
        { name: 'Avatar Customer', email: 'avatar@example.com' },
        imageUpload(),
      ),
    ).rejects.toThrow('database unavailable');

    const contactId = String(repository.create.mock.calls[0][0]._id);
    expect(avatarStorage.delete).toHaveBeenCalledWith('org-1', contactId);
  });

  it('uploads and persists a replacement avatar while updating a contact', async () => {
    const contactId = '66cc9bdfa847ea856c7b41d2';
    const avatarUrl =
      'https://res.cloudinary.com/demo/image/upload/customer-v2.png';
    const avatar = imageUpload();
    repository.findById.mockResolvedValue({
      _id: contactId,
      name: 'Customer',
      email: 'customer@example.com',
      status: CustomerContactStatus.ACTIVE,
    });
    avatarStorage.upload.mockResolvedValue(avatarUrl);
    repository.update.mockImplementation(
      async (_organizationId, _id, update) => ({
        _id: contactId,
        name: 'Customer',
        email: 'customer@example.com',
        status: CustomerContactStatus.ACTIVE,
        ...update,
      }),
    );

    const result = await service.update(
      'org-1',
      'user-1',
      contactId,
      {},
      avatar,
    );

    expect(avatarStorage.upload).toHaveBeenCalledWith(
      'org-1',
      contactId,
      avatar,
    );
    expect(repository.update).toHaveBeenCalledWith('org-1', contactId, {
      avatarUrl,
    });
    expect(result).toEqual(expect.objectContaining({ avatarUrl }));
  });

  it('returns bounded public contact fields for bulk list enrichment', async () => {
    repository.findActiveByIds.mockResolvedValue([
      {
        _id: '66cc9bdfa847ea856c7b41d2',
        name: 'Tahid Rahman',
        phone: '+8801812345678',
        email: 'private@example.com',
        notes: 'not needed by a call list',
      },
    ]);

    await expect(
      service.listActiveSummaries('org-1', [
        '66cc9bdfa847ea856c7b41d2',
        '66cc9bdfa847ea856c7b41d2',
        'invalid-id',
      ]),
    ).resolves.toEqual([
      {
        id: '66cc9bdfa847ea856c7b41d2',
        name: 'Tahid Rahman',
        phone: '+8801812345678',
      },
    ]);
    expect(repository.findActiveByIds).toHaveBeenCalledWith('org-1', [
      '66cc9bdfa847ea856c7b41d2',
    ]);
  });

  it('creates unique contacts in bulk and reports duplicate input rows', async () => {
    repository.createMany.mockImplementation(async (inputs) =>
      inputs.map((input: Record<string, unknown>) => ({ ...input })),
    );

    const result = await service.bulkCreate('org-1', 'user-1', {
      contacts: [
        { name: 'First', email: 'first@example.com' },
        { name: 'Duplicate', email: 'first@example.com' },
        { name: 'Second', phone: '+8801812345678' },
      ],
    });

    expect(repository.findDuplicatesMany).toHaveBeenCalledWith(
      'org-1',
      ['first@example.com'],
      ['+8801812345678'],
    );
    expect(repository.createMany).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'First',
          organizationId: 'org-1',
          createdByUserId: 'user-1',
        }),
        expect.objectContaining({ name: 'Second' }),
      ]),
    );
    expect(result.summary).toEqual({ received: 3, created: 2, skipped: 1 });
    expect(result.items[1]).toEqual({
      index: 1,
      status: 'SKIPPED',
      code: 'DUPLICATE_IN_REQUEST',
      message: 'Another row in this request uses the same email or phone',
    });
  });

  it('skips contacts that already exist in the organization', async () => {
    repository.findDuplicatesMany.mockResolvedValue([
      { email: 'existing@example.com' },
    ]);
    repository.createMany.mockResolvedValue([]);

    const result = await service.bulkCreate('org-1', 'user-1', {
      contacts: [{ name: 'Existing', email: 'existing@example.com' }],
    });

    expect(repository.createMany).not.toHaveBeenCalled();
    expect(result.summary).toEqual({ received: 1, created: 0, skipped: 1 });
    expect(result.items[0]).toEqual(
      expect.objectContaining({ code: 'DUPLICATE_EXISTING_CONTACT' }),
    );
  });
});

function imageUpload(): Express.Multer.File {
  return {
    fieldname: 'avatar',
    originalname: 'customer.png',
    encoding: '7bit',
    mimetype: 'image/png',
    size: 4,
    destination: '',
    filename: '',
    path: '',
    buffer: Buffer.from('image'),
    stream: undefined as never,
  };
}
