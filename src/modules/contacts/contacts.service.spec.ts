import { ConflictException } from '@nestjs/common';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { ContactsRepository } from './contacts.repository';
import { ContactsService } from './contacts.service';

describe('ContactsService', () => {
  let repository: Record<string, jest.Mock>;
  let service: ContactsService;

  beforeEach(() => {
    repository = {
      create: jest.fn(),
      findDuplicate: jest.fn().mockResolvedValue(null),
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

  it('maps a duplicate-key race to a conflict response', async () => {
    repository.create.mockRejectedValue({ code: 11000 });

    await expect(
      service.create('org-1', 'user-1', {
        name: 'Concurrent duplicate',
        email: 'duplicate@example.com',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
