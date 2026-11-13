import { BadRequestException, Injectable } from '@nestjs/common';
import { CustomerActivityType } from '../../common/enums/customer-activity-type.enum';
import { ContactCrmLinksRepository } from './contact-crm-links.repository';
import {
  ContactActivityCursor,
  ContactActivityRepository,
  ContactActivityRecord,
} from './contact-activity.repository';
import { ContactsService } from './contacts.service';
import { ListContactActivityQueryDto } from './dto/list-contact-activity-query.dto';

type ActivityCursorPayload = {
  version: 1;
  occurredAt: string;
  sortKey: string;
};

@Injectable()
export class ContactActivityService {
  constructor(
    private readonly contacts: ContactsService,
    private readonly crmLinks: ContactCrmLinksRepository,
    private readonly repository: ContactActivityRepository,
  ) {}

  async list(
    organizationId: string,
    contactId: string,
    query: ListContactActivityQueryDto,
  ) {
    await this.contacts.get(organizationId, contactId);
    const linkedCrm = await this.crmLinks.list(organizationId, contactId);
    const cursor = query.cursor ? this.decodeCursor(query.cursor) : undefined;
    const records = await this.repository.list({
      organizationId,
      contactId,
      crmIdentities: linkedCrm.map((item) => ({
        provider: String(item.provider),
        objectType: String(item.objectType),
        externalId: String(item.externalId),
      })),
      limit: query.limit,
      cursor,
    });
    const hasMore = records.length > query.limit;
    const page = records.slice(0, query.limit);
    const last = page[page.length - 1];

    return {
      items: page.map((item) => this.toResponse(item)),
      pagination: {
        limit: query.limit,
        hasMore,
        nextCursor: hasMore && last ? this.encodeCursor(last) : null,
      },
    };
  }

  private toResponse(record: ContactActivityRecord) {
    return {
      id: record.id,
      type: record.type,
      action: record.action,
      title: this.displayTitle(record),
      status: record.status,
      occurredAt: new Date(record.occurredAt).toISOString(),
      source: record.source,
      metadata: record.metadata || {},
    };
  }

  private displayTitle(record: ContactActivityRecord) {
    if (
      ![
        CustomerActivityType.CONTACT,
        CustomerActivityType.CRM,
        CustomerActivityType.NOTE,
        CustomerActivityType.FILE,
      ].includes(record.type)
    ) {
      return record.title;
    }
    const titles: Record<string, string> = {
      CONTACT_CREATED: 'Customer added',
      CONTACT_UPDATED: 'Customer profile updated',
      CONTACT_ARCHIVED: 'Customer archived',
      CONTACT_CRM_LINKED: 'CRM record linked',
      CONTACT_CRM_UNLINKED: 'CRM record unlinked',
      CRM_RECORD_CREATED: 'CRM record created',
      CRM_RECORD_UPDATED: 'CRM record updated',
      CRM_RECORD_DELETED: 'CRM record deleted',
      CUSTOMER_NOTE_CREATED: 'Note added',
      CUSTOMER_NOTE_UPDATED: 'Note updated',
      CUSTOMER_NOTE_DELETED: 'Note deleted',
      CUSTOMER_FILE_UPLOADED: 'File uploaded',
      CUSTOMER_FILE_DELETED: 'File deleted',
    };
    return (
      titles[record.action] ||
      record.action
        .toLowerCase()
        .split('_')
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ')
    );
  }

  private encodeCursor(record: ContactActivityRecord) {
    const payload: ActivityCursorPayload = {
      version: 1,
      occurredAt: new Date(record.occurredAt).toISOString(),
      sortKey: record.sortKey,
    };
    return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  }

  private decodeCursor(value: string): ContactActivityCursor {
    try {
      const payload = JSON.parse(
        Buffer.from(value, 'base64url').toString('utf8'),
      ) as Partial<ActivityCursorPayload>;
      const occurredAt = new Date(payload.occurredAt || '');
      if (
        payload.version !== 1 ||
        Number.isNaN(occurredAt.getTime()) ||
        typeof payload.sortKey !== 'string' ||
        !payload.sortKey ||
        payload.sortKey.length > 500
      ) {
        throw new Error('invalid cursor payload');
      }
      return { occurredAt, sortKey: payload.sortKey };
    } catch {
      throw new BadRequestException('Invalid activity cursor');
    }
  }
}
