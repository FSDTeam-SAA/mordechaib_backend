import { ConflictException } from '@nestjs/common';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { ContactsRepository } from './contacts.repository';
import { ContactsService } from './contacts.service';
import { CustomerLeadStatus } from '../../common/enums/customer-lead-status.enum';

describe('ContactsService', () => {
  let repository: Record<string, jest.Mock>;
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
    service = new ContactsService(
      repository as unknown as ContactsRepository,
      { create: jest.fn() } as unknown as AuditLogsService,
    );
  });

  it('creates an organization-scoped contact with a normalized phone', async () => {
    repository.create.mockImplementation(async (input) => ({
      _id: '66cc9bdfa847ea856c7b41d2',
      ...input,
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
      _id: '66cc9bdfa847ea856c7b41d2',
      ...input,
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
