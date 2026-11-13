import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { isValidObjectId } from 'mongoose';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { ContactCrmLinksRepository } from './contact-crm-links.repository';
import { ContactCrmRecordsReader } from './contact-crm-records.reader';
import { ContactsService } from './contacts.service';

const MAX_CRM_LINKS_PER_CONTACT = 100;

@Injectable()
export class ContactCrmLinksService {
  private readonly logger = new Logger(ContactCrmLinksService.name);

  constructor(
    private readonly links: ContactCrmLinksRepository,
    private readonly contacts: ContactsService,
    private readonly crmRecords: ContactCrmRecordsReader,
    private readonly audits: AuditLogsService,
  ) {}

  async link(
    organizationId: string,
    userId: string,
    contactId: string,
    crmRecordId: string,
  ) {
    this.assertId(contactId, 'contactId');
    this.assertId(crmRecordId, 'crmRecordId');
    await this.contacts.assertActiveIds(organizationId, [contactId]);

    const record = await this.crmRecords.get(organizationId, crmRecordId);
    if (record.archived === true) {
      throw new ConflictException('Archived CRM records cannot be linked');
    }

    const existing = await this.links.findByCrmRecord(
      organizationId,
      crmRecordId,
    );
    if (existing) {
      if (existing.contactId !== contactId) {
        throw new ConflictException(
          'This CRM record is already linked to another customer',
        );
      }
      return this.response(existing, record);
    }

    const count = await this.links.count(organizationId, contactId);
    if (count >= MAX_CRM_LINKS_PER_CONTACT) {
      throw new BadRequestException(
        `A customer can have at most ${MAX_CRM_LINKS_PER_CONTACT} CRM links`,
      );
    }

    let link: Record<string, unknown>;
    try {
      link = await this.links.create({
        organizationId,
        contactId,
        crmRecordId,
        provider: record.provider,
        objectType: record.objectType,
        externalId: record.externalId,
        linkedByUserId: userId,
      });
    } catch (error) {
      if (!this.isDuplicateKey(error)) throw error;
      const concurrent = await this.links.findByCrmRecord(
        organizationId,
        crmRecordId,
      );
      if (!concurrent || concurrent.contactId !== contactId) {
        throw new ConflictException(
          'This CRM record is already linked to another customer',
        );
      }
      link = concurrent as unknown as Record<string, unknown>;
    }

    await this.audit(organizationId, userId, 'CONTACT_CRM_LINKED', link);
    return this.response(link, record);
  }

  async list(organizationId: string, contactId: string) {
    this.assertId(contactId, 'contactId');
    await this.contacts.get(organizationId, contactId);
    const links = await this.links.list(organizationId, contactId);
    const records = await this.crmRecords.getMany(
      organizationId,
      links.map((link) => link.crmRecordId),
    );
    const recordsById = new Map(records.map((record) => [record.id, record]));
    return {
      items: links.map((link) =>
        this.response(link, recordsById.get(link.crmRecordId) ?? null),
      ),
      total: links.length,
    };
  }

  async unlink(
    organizationId: string,
    userId: string,
    contactId: string,
    crmRecordId: string,
  ) {
    this.assertId(contactId, 'contactId');
    this.assertId(crmRecordId, 'crmRecordId');
    await this.contacts.get(organizationId, contactId);
    const link = await this.links.unlink(
      organizationId,
      contactId,
      crmRecordId,
    );
    if (!link) throw new NotFoundException('Customer CRM link not found');
    await this.audit(organizationId, userId, 'CONTACT_CRM_UNLINKED', link);
    return { contactId, crmRecordId, unlinked: true };
  }

  private response(
    link: Record<string, unknown>,
    record: Record<string, unknown> | null,
  ) {
    return {
      id: String(link._id),
      contactId: link.contactId,
      crmRecordId: link.crmRecordId,
      provider: link.provider,
      objectType: link.objectType,
      externalId: link.externalId,
      linkedByUserId: link.linkedByUserId,
      createdAt: link.createdAt,
      updatedAt: link.updatedAt,
      record,
    };
  }

  private assertId(value: string, field: string) {
    if (!isValidObjectId(value)) {
      throw new BadRequestException(`${field} must be a valid MongoDB id`);
    }
  }

  private isDuplicateKey(error: unknown) {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 11000
    );
  }

  private async audit(
    organizationId: string,
    userId: string,
    action: string,
    link: Record<string, unknown>,
  ) {
    try {
      await this.audits.create({
        organizationId,
        userId,
        action,
        resourceType: 'CUSTOMER_CRM_LINK',
        resourceId: String(link._id),
        metadata: {
          contactId: link.contactId,
          crmRecordId: link.crmRecordId,
          provider: link.provider,
          objectType: link.objectType,
          externalId: link.externalId,
        },
      });
    } catch (error) {
      this.logger.warn(
        `Unable to write customer CRM link audit: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
    }
  }
}
