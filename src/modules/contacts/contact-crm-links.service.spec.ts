import { ConflictException, NotFoundException } from '@nestjs/common';
import { IntegrationProvider } from '../../database/schemas/integration.schema';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { ContactCrmRecordsReader } from './contact-crm-records.reader';
import { ContactCrmLinksRepository } from './contact-crm-links.repository';
import { ContactCrmLinksService } from './contact-crm-links.service';
import { ContactsService } from './contacts.service';

describe('ContactCrmLinksService', () => {
  const contactId = '66cc9bdfa847ea856c7b41d2';
  const otherContactId = '66cc9bdfa847ea856c7b41d3';
  const crmRecordId = '66cc9bdfa847ea856c7b41d4';
  const linkId = '66cc9bdfa847ea856c7b41d5';

  let links: Record<string, jest.Mock>;
  let contacts: Record<string, jest.Mock>;
  let crmRecords: Record<string, jest.Mock>;
  let audits: Record<string, jest.Mock>;
  let service: ContactCrmLinksService;

  const record = {
    id: crmRecordId,
    provider: IntegrationProvider.HUBSPOT,
    objectType: 'contacts',
    externalId: 'hubspot-contact-1',
    archived: false,
    properties: { email: 'mike@example.com' },
  };

  const link = {
    _id: linkId,
    organizationId: 'org-1',
    contactId,
    crmRecordId,
    provider: IntegrationProvider.HUBSPOT,
    objectType: 'contacts',
    externalId: 'hubspot-contact-1',
    linkedByUserId: 'user-1',
  };

  beforeEach(() => {
    links = {
      create: jest.fn().mockResolvedValue(link),
      list: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
      findByCrmRecord: jest.fn().mockResolvedValue(null),
      unlink: jest.fn(),
    };
    contacts = {
      assertActiveIds: jest.fn().mockResolvedValue(undefined),
      get: jest.fn().mockResolvedValue({ id: contactId, status: 'ACTIVE' }),
    };
    crmRecords = {
      get: jest.fn().mockResolvedValue(record),
      getMany: jest.fn().mockResolvedValue([]),
    };
    audits = { create: jest.fn().mockResolvedValue(undefined) };
    service = new ContactCrmLinksService(
      links as unknown as ContactCrmLinksRepository,
      contacts as unknown as ContactsService,
      crmRecords as unknown as ContactCrmRecordsReader,
      audits as unknown as AuditLogsService,
    );
  });

  it('derives CRM identity from the authoritative synchronized record', async () => {
    const result = await service.link(
      'org-1',
      'user-1',
      contactId,
      crmRecordId,
    );

    expect(contacts.assertActiveIds).toHaveBeenCalledWith('org-1', [contactId]);
    expect(crmRecords.get).toHaveBeenCalledWith('org-1', crmRecordId);
    expect(links.create).toHaveBeenCalledWith({
      organizationId: 'org-1',
      contactId,
      crmRecordId,
      provider: IntegrationProvider.HUBSPOT,
      objectType: 'contacts',
      externalId: 'hubspot-contact-1',
      linkedByUserId: 'user-1',
    });
    expect(result).toEqual(expect.objectContaining({ crmRecordId, record }));
    expect(audits.create).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'CONTACT_CRM_LINKED' }),
    );
  });

  it('returns the existing link for an idempotent retry', async () => {
    links.findByCrmRecord.mockResolvedValue(link);

    const result = await service.link(
      'org-1',
      'user-1',
      contactId,
      crmRecordId,
    );

    expect(links.create).not.toHaveBeenCalled();
    expect(result).toEqual(expect.objectContaining({ id: linkId }));
  });

  it('rejects a CRM record already linked to another customer', async () => {
    links.findByCrmRecord.mockResolvedValue({
      ...link,
      contactId: otherContactId,
    });

    await expect(
      service.link('org-1', 'user-1', contactId, crmRecordId),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(links.create).not.toHaveBeenCalled();
  });

  it('returns linked records in one batch and keeps stale links explicit', async () => {
    const missingRecordId = '66cc9bdfa847ea856c7b41d6';
    links.list.mockResolvedValue([
      link,
      { ...link, _id: 'link-2', crmRecordId: missingRecordId },
    ]);
    crmRecords.getMany.mockResolvedValue([record]);

    const result = await service.list('org-1', contactId);

    expect(crmRecords.getMany).toHaveBeenCalledWith('org-1', [
      crmRecordId,
      missingRecordId,
    ]);
    expect(result.total).toBe(2);
    expect(result.items[0].record).toEqual(record);
    expect(result.items[1].record).toBeNull();
  });

  it('unlinks only within the requested customer scope', async () => {
    links.unlink.mockResolvedValue(link);

    await expect(
      service.unlink('org-1', 'user-1', contactId, crmRecordId),
    ).resolves.toEqual({ contactId, crmRecordId, unlinked: true });
    expect(links.unlink).toHaveBeenCalledWith('org-1', contactId, crmRecordId);
    expect(audits.create).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'CONTACT_CRM_UNLINKED' }),
    );
  });

  it('returns not found when the scoped link does not exist', async () => {
    links.unlink.mockResolvedValue(null);

    await expect(
      service.unlink('org-1', 'user-1', contactId, crmRecordId),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
