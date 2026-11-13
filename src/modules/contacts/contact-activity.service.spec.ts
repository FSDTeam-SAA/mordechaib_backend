import { BadRequestException } from '@nestjs/common';
import { CustomerActivityType } from '../../common/enums/customer-activity-type.enum';
import { ContactActivityRepository } from './contact-activity.repository';
import { ContactActivityService } from './contact-activity.service';
import { ContactCrmLinksRepository } from './contact-crm-links.repository';
import { ContactsService } from './contacts.service';

describe('ContactActivityService', () => {
  const organizationId = 'org-1';
  const contactId = '507f1f77bcf86cd799439011';
  let contacts: { get: jest.Mock };
  let crmLinks: { list: jest.Mock };
  let repository: { list: jest.Mock };
  let service: ContactActivityService;

  beforeEach(() => {
    contacts = { get: jest.fn().mockResolvedValue({ id: contactId }) };
    crmLinks = {
      list: jest.fn().mockResolvedValue([
        {
          provider: 'HUBSPOT',
          objectType: 'contacts',
          externalId: 'hs-1',
        },
      ]),
    };
    repository = { list: jest.fn() };
    service = new ContactActivityService(
      contacts as unknown as ContactsService,
      crmLinks as unknown as ContactCrmLinksRepository,
      repository as unknown as ContactActivityRepository,
    );
  });

  it('returns a stable opaque cursor without exposing internal sort keys', async () => {
    repository.list.mockResolvedValue([
      thisRecord('task:2', '2026-11-12T09:00:00.000Z', 'TASK:2'),
      thisRecord('task:1', '2026-11-12T08:00:00.000Z', 'TASK:1'),
      thisRecord('task:0', '2026-11-12T07:00:00.000Z', 'TASK:0'),
    ]);

    const first = await service.list(organizationId, contactId, { limit: 2 });

    expect(first.items).toHaveLength(2);
    expect(first.items[0]).not.toHaveProperty('sortKey');
    expect(first.pagination).toEqual({
      limit: 2,
      hasMore: true,
      nextCursor: expect.any(String),
    });
    expect(repository.list).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId,
        contactId,
        limit: 2,
        crmIdentities: [
          {
            provider: 'HUBSPOT',
            objectType: 'contacts',
            externalId: 'hs-1',
          },
        ],
      }),
    );

    repository.list.mockResolvedValue([]);
    await service.list(organizationId, contactId, {
      limit: 2,
      cursor: first.pagination.nextCursor!,
    });
    expect(repository.list).toHaveBeenLastCalledWith(
      expect.objectContaining({
        cursor: {
          occurredAt: new Date('2026-11-12T08:00:00.000Z'),
          sortKey: 'TASK:1',
        },
      }),
    );
  });

  it('rejects malformed cursors before querying activity', async () => {
    await expect(
      service.list(organizationId, contactId, {
        limit: 30,
        cursor: 'not-a-valid-cursor',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(repository.list).not.toHaveBeenCalled();
  });

  function thisRecord(id: string, occurredAt: string, sortKey: string) {
    return {
      id,
      type: CustomerActivityType.TASK,
      action: 'TASK_CREATED',
      title: 'Follow up',
      status: 'TO_DO',
      occurredAt: new Date(occurredAt),
      source: { type: 'TASK', id },
      metadata: {},
      sortKey,
    };
  }
});
