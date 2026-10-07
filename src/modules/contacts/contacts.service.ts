import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Types } from 'mongoose';
import { CustomerContactStatus } from '../../common/enums/customer-contact-status.enum';
import {
  isE164,
  normalizePhoneNumber,
} from '../../common/helpers/phone.helper';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { ContactsRepository } from './contacts.repository';
import { CreateContactDto } from './dto/create-contact.dto';
import { ListContactsQueryDto } from './dto/list-contacts-query.dto';
import { UpdateContactDto } from './dto/update-contact.dto';

@Injectable()
export class ContactsService {
  private readonly logger = new Logger(ContactsService.name);

  constructor(
    private readonly repository: ContactsRepository,
    private readonly audits: AuditLogsService,
  ) {}

  async create(organizationId: string, userId: string, dto: CreateContactDto) {
    const input = this.normalized(dto);
    this.assertContactMethod(input);
    await this.assertNotDuplicate(organizationId, input);
    const contact = await this.withDuplicateConflict(() =>
      this.repository.create({
        ...input,
        organizationId,
        createdByUserId: userId,
        status: CustomerContactStatus.ACTIVE,
      }),
    );
    await this.audit(organizationId, userId, 'CONTACT_CREATED', contact);
    return this.toResponse(contact);
  }

  async list(organizationId: string, query: ListContactsQueryDto) {
    const result = await this.repository.list(organizationId, query);
    return {
      items: result.items.map((item) => this.toResponse(item)),
      pagination: {
        page: query.page,
        limit: query.limit,
        total: result.total,
        pages: Math.ceil(result.total / query.limit),
      },
    };
  }

  async get(organizationId: string, id: string) {
    this.assertId(id);
    const contact = await this.repository.findById(organizationId, id);
    if (!contact) throw new NotFoundException('Contact not found');
    return this.toResponse(contact);
  }

  async update(
    organizationId: string,
    userId: string,
    id: string,
    dto: UpdateContactDto,
  ) {
    this.assertId(id);
    if (Object.values(dto).every((value) => value === undefined)) {
      throw new BadRequestException('No contact changes were provided');
    }
    const current = await this.repository.findById(organizationId, id);
    if (!current) throw new NotFoundException('Contact not found');
    if (current.status !== CustomerContactStatus.ACTIVE) {
      throw new ConflictException('Archived contacts cannot be updated');
    }
    const update = this.normalized(dto);
    const merged = {
      email: update.email ?? current.email,
      phone: update.phone ?? current.phone,
    };
    this.assertContactMethod(merged);
    await this.assertNotDuplicate(organizationId, merged, id);
    const contact = await this.withDuplicateConflict(() =>
      this.repository.update(organizationId, id, update),
    );
    if (!contact) throw new NotFoundException('Contact not found');
    await this.audit(organizationId, userId, 'CONTACT_UPDATED', contact);
    return this.toResponse(contact);
  }

  async archive(organizationId: string, userId: string, id: string) {
    this.assertId(id);
    const contact = await this.repository.archive(organizationId, id, userId);
    if (!contact) throw new NotFoundException('Active contact not found');
    await this.audit(organizationId, userId, 'CONTACT_ARCHIVED', contact);
    return { id, archived: true };
  }

  async resolvePhone(organizationId: string, id: string) {
    const contact = await this.requireActive(organizationId, id);
    if (!contact.phone) {
      throw new BadRequestException('The selected contact has no phone number');
    }
    return contact;
  }

  async resolveEmails(organizationId: string, ids: string[]) {
    const contacts = await this.requireActiveMany(organizationId, ids);
    const withoutEmail = contacts.find((contact) => !contact.email);
    if (withoutEmail) {
      throw new BadRequestException(
        `Contact ${withoutEmail.name} has no email address`,
      );
    }
    return contacts.map((contact) => contact.email!);
  }

  async assertActiveIds(organizationId: string, ids: string[]) {
    await this.requireActiveMany(organizationId, ids);
  }

  private async requireActive(organizationId: string, id: string) {
    this.assertId(id);
    const contact = await this.repository.findById(organizationId, id);
    if (!contact || contact.status !== CustomerContactStatus.ACTIVE) {
      throw new NotFoundException('Active contact not found');
    }
    return contact;
  }

  private async requireActiveMany(organizationId: string, ids: string[]) {
    const uniqueIds = [...new Set(ids)];
    uniqueIds.forEach((id) => this.assertId(id));
    if (!uniqueIds.length) return [];
    const contacts = await this.repository.findActiveByIds(
      organizationId,
      uniqueIds,
    );
    if (contacts.length !== uniqueIds.length) {
      throw new NotFoundException(
        'One or more contacts were not found or are archived',
      );
    }
    const byId = new Map(
      contacts.map((contact) => [String(contact._id), contact]),
    );
    return uniqueIds.map((id) => byId.get(id)!);
  }

  private normalized(dto: CreateContactDto | UpdateContactDto) {
    const value: Record<string, unknown> = { ...dto };
    if (dto.phone !== undefined) {
      const phone = normalizePhoneNumber(dto.phone);
      if (!isE164(phone)) {
        throw new BadRequestException('phone must be a valid E.164 number');
      }
      value.phone = phone;
    }
    if (dto.tags) {
      value.tags = [
        ...new Set(dto.tags.map((tag) => tag.trim()).filter(Boolean)),
      ];
    }
    return value as {
      name?: string;
      email?: string;
      phone?: string;
      company?: string;
      jobTitle?: string;
      notes?: string;
      tags?: string[];
    };
  }

  private assertContactMethod(input: { email?: string; phone?: string }) {
    if (!input.email && !input.phone) {
      throw new BadRequestException(
        'At least one of email or phone is required',
      );
    }
  }

  private async assertNotDuplicate(
    organizationId: string,
    input: { email?: string; phone?: string },
    excludeId?: string,
  ) {
    const duplicate = await this.repository.findDuplicate(
      organizationId,
      input,
      excludeId,
    );
    if (duplicate) {
      throw new ConflictException(
        'An active contact already uses this email or phone number',
      );
    }
  }

  private assertId(id: string) {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('contactId must be a valid MongoDB id');
    }
  }

  private async withDuplicateConflict<T>(operation: () => Promise<T>) {
    try {
      return await operation();
    } catch (error) {
      if ((error as { code?: number }).code === 11000) {
        throw new ConflictException(
          'An active contact already uses this email or phone number',
        );
      }
      throw error;
    }
  }

  private toResponse(contact: object) {
    const record = contact as unknown as Record<string, unknown>;
    const { _id, __v, organizationId, ...response } = record;
    void __v;
    void organizationId;
    return { id: String(_id), ...response };
  }

  private async audit(
    organizationId: string,
    userId: string,
    action: string,
    contact: object,
  ) {
    try {
      const record = contact as unknown as Record<string, unknown>;
      await this.audits.create({
        organizationId,
        userId,
        action,
        resourceType: 'CUSTOMER_CONTACT',
        resourceId: String(record._id),
      });
    } catch (error) {
      this.logger.warn(
        `Unable to write contact audit: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
    }
  }
}
