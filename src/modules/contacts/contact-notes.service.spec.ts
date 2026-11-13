import { ConflictException } from '@nestjs/common';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { ContactNotesRepository } from './contact-notes.repository';
import { ContactNotesService } from './contact-notes.service';
import { ContactsService } from './contacts.service';

describe('ContactNotesService', () => {
  const organizationId = 'org-1';
  const userId = 'user-1';
  const contactId = '507f1f77bcf86cd799439011';
  const noteId = '507f191e810c19729de860ea';
  let repository: Record<string, jest.Mock>;
  let contacts: Record<string, jest.Mock>;
  let audits: Record<string, jest.Mock>;
  let service: ContactNotesService;

  beforeEach(() => {
    repository = {
      create: jest.fn(),
      list: jest.fn(),
      update: jest.fn(),
      find: jest.fn(),
      archive: jest.fn(),
    };
    contacts = {
      get: jest.fn().mockResolvedValue({ id: contactId }),
      assertActiveIds: jest.fn().mockResolvedValue([]),
    };
    audits = { create: jest.fn().mockResolvedValue({}) };
    service = new ContactNotesService(
      repository as unknown as ContactNotesRepository,
      contacts as unknown as ContactsService,
      audits as unknown as AuditLogsService,
    );
  });

  it('creates a trimmed, explicitly linked manual note', async () => {
    repository.create.mockImplementation((input) => ({
      _id: noteId,
      ...input,
      createdAt: new Date(),
    }));

    const result = await service.create(organizationId, userId, contactId, {
      content: '  Customer prefers email.  ',
    });

    expect(contacts.assertActiveIds).toHaveBeenCalledWith(organizationId, [
      contactId,
    ]);
    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId,
        contactId,
        content: 'Customer prefers email.',
        source: 'MANUAL',
        revision: 1,
      }),
    );
    expect(result).toEqual(
      expect.objectContaining({ id: noteId, revision: 1 }),
    );
    expect(audits.create).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'CUSTOMER_NOTE_CREATED',
        metadata: expect.objectContaining({ contactId }),
      }),
    );
  });

  it('rejects a stale note update without overwriting newer content', async () => {
    repository.update.mockResolvedValue(null);
    repository.find.mockResolvedValue({ _id: noteId, revision: 2 });

    await expect(
      service.update(organizationId, userId, contactId, noteId, {
        content: 'Updated note',
        expectedRevision: 1,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('allows notes on an archived customer to remain readable', async () => {
    repository.list.mockResolvedValue({
      items: [{ _id: noteId, content: 'Historical note', revision: 1 }],
      total: 1,
    });

    const result = await service.list(organizationId, contactId, {
      page: 1,
      limit: 20,
    });

    expect(contacts.get).toHaveBeenCalledWith(organizationId, contactId);
    expect(result.pagination.total).toBe(1);
  });
});
