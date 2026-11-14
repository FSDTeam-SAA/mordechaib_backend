import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Types } from 'mongoose';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CustomerContactStatus } from '../../common/enums/customer-contact-status.enum';
import { CustomerLeadStatus } from '../../common/enums/customer-lead-status.enum';
import {
  isE164,
  normalizePhoneNumber,
} from '../../common/helpers/phone.helper';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { ContactsRepository } from './contacts.repository';
import { CreateContactDto } from './dto/create-contact.dto';
import { ListContactsQueryDto } from './dto/list-contacts-query.dto';
import { UpdateContactDto } from './dto/update-contact.dto';
import { ListContactHealthQueryDto } from './dto/list-contact-health-query.dto';
import { BulkCreateContactsDto } from './dto/bulk-create-contacts.dto';
import { parseContactCsv } from './contact-csv.parser';

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

  async bulkCreate(
    organizationId: string,
    userId: string,
    dto: BulkCreateContactsDto,
  ) {
    const rows = dto.contacts.map((contact, index) => ({
      index,
      input: this.normalized(contact),
    }));
    rows.forEach(({ input }) => this.assertContactMethod(input));

    const skipped = new Map<number, { code: string; message: string }>();
    const emailIndexes = new Map<string, number>();
    const phoneIndexes = new Map<string, number>();
    for (const row of rows) {
      const duplicateInRequest =
        (row.input.email && emailIndexes.has(row.input.email)) ||
        (row.input.phone && phoneIndexes.has(row.input.phone));
      if (duplicateInRequest) {
        skipped.set(row.index, {
          code: 'DUPLICATE_IN_REQUEST',
          message: 'Another row in this request uses the same email or phone',
        });
        continue;
      }
      if (row.input.email) emailIndexes.set(row.input.email, row.index);
      if (row.input.phone) phoneIndexes.set(row.input.phone, row.index);
    }

    const existing = await this.repository.findDuplicatesMany(
      organizationId,
      [...emailIndexes.keys()],
      [...phoneIndexes.keys()],
    );
    const existingEmails = new Set(
      existing
        .map((contact) => contact.email)
        .filter((email): email is string => Boolean(email)),
    );
    const existingPhones = new Set(
      existing
        .map((contact) => contact.phone)
        .filter((phone): phone is string => Boolean(phone)),
    );
    for (const row of rows) {
      if (skipped.has(row.index)) continue;
      if (
        (row.input.email && existingEmails.has(row.input.email)) ||
        (row.input.phone && existingPhones.has(row.input.phone))
      ) {
        skipped.set(row.index, {
          code: 'DUPLICATE_EXISTING_CONTACT',
          message: 'An active contact already uses this email or phone',
        });
      }
    }

    const candidates = rows
      .filter((row) => !skipped.has(row.index))
      .map((row) => ({ ...row, id: new Types.ObjectId() }));
    let created: object[] = [];
    if (candidates.length) {
      try {
        created = await this.repository.createMany(
          candidates.map((candidate) => ({
            _id: candidate.id,
            ...candidate.input,
            organizationId,
            createdByUserId: userId,
            status: CustomerContactStatus.ACTIVE,
          })),
        );
      } catch (error) {
        if ((error as { code?: number }).code !== 11000) throw error;
        created = await this.repository.findByIds(
          organizationId,
          candidates.map((candidate) => String(candidate.id)),
        );
      }
    }

    const createdById = new Map(
      created.map((contact) => {
        const record = contact as unknown as Record<string, unknown>;
        return [String(record._id), contact];
      }),
    );
    const candidateByIndex = new Map(
      candidates.map((candidate) => [candidate.index, candidate]),
    );
    for (const candidate of candidates) {
      if (!createdById.has(String(candidate.id))) {
        skipped.set(candidate.index, {
          code: 'DUPLICATE_CONCURRENT',
          message: 'The contact was created by another request',
        });
      }
    }
    await Promise.all(
      created.map((contact) =>
        this.audit(organizationId, userId, 'CONTACT_CREATED', contact),
      ),
    );

    const items = rows.map((row) => {
      const skip = skipped.get(row.index);
      if (skip) return { index: row.index, status: 'SKIPPED', ...skip };
      const candidate = candidateByIndex.get(row.index)!;
      const contact = createdById.get(String(candidate.id))!;
      return {
        index: row.index,
        status: 'CREATED',
        contact: this.toResponse(contact),
      };
    });
    return {
      summary: {
        received: rows.length,
        created: created.length,
        skipped: skipped.size,
      },
      items,
    };
  }

  async bulkCreateFromCsv(
    organizationId: string,
    userId: string,
    file: Express.Multer.File | undefined,
  ) {
    if (!file?.buffer?.length) {
      throw new BadRequestException('A non-empty CSV file is required');
    }
    const contacts = parseContactCsv(file.buffer);
    const validationErrors = await this.validateImportedContacts(contacts);
    if (validationErrors.length) {
      throw new BadRequestException({
        message: 'CSV contains invalid contact rows',
        errors: validationErrors,
      });
    }
    return this.bulkCreate(organizationId, userId, { contacts });
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

  async healthHistory(
    organizationId: string,
    id: string,
    query: ListContactHealthQueryDto,
  ) {
    await this.get(organizationId, id);
    const result = await this.repository.healthHistory(
      organizationId,
      id,
      query,
    );
    return {
      items: result.items.map((item) => ({
        id: String(item._id),
        source: item.source,
        healthScore: item.healthScore,
        riskLevel: item.riskLevel,
        analysisConfidence: item.analysisConfidence,
        capturedAt: item.capturedAt,
      })),
      pagination: {
        page: query.page,
        limit: query.limit,
        total: result.total,
        pages: Math.ceil(result.total / query.limit),
      },
    };
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

  async listActiveSummaries(organizationId: string, ids: string[]) {
    const uniqueIds = [...new Set(ids)].filter((id) =>
      Types.ObjectId.isValid(id),
    );
    if (!uniqueIds.length) return [];
    const contacts = await this.repository.findActiveByIds(
      organizationId,
      uniqueIds,
    );
    return contacts.map((contact) => ({
      id: String(contact._id),
      name: contact.name,
      phone: contact.phone,
    }));
  }

  async findActiveByPhone(organizationId: string, phone: string) {
    const normalized = normalizePhoneNumber(phone);
    if (!isE164(normalized)) return null;
    const contact = await this.repository.findActiveByPhone(
      organizationId,
      normalized,
    );
    return contact ? this.toResponse(contact) : null;
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
      avatarUrl?: string;
      location?: string;
      website?: string;
      linkedinUrl?: string;
      leadStatus?: CustomerLeadStatus;
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

  private async validateImportedContacts(contacts: CreateContactDto[]) {
    const errors: Array<{
      row: number;
      fields: Array<{ field: string; messages: string[] }>;
    }> = [];
    for (let index = 0; index < contacts.length; index += 1) {
      const instance = plainToInstance(CreateContactDto, contacts[index]);
      contacts[index] = instance;
      const violations = await validate(instance, {
        whitelist: true,
        forbidNonWhitelisted: true,
      });
      const fields = violations.map((violation) => ({
        field: violation.property,
        messages: Object.values(violation.constraints || {}),
      }));
      try {
        this.assertContactMethod(this.normalized(instance));
      } catch (error) {
        fields.push({
          field: 'contactMethod',
          messages: [
            error instanceof Error
              ? error.message
              : 'At least one contact method is required',
          ],
        });
      }
      if (fields.length) errors.push({ row: index + 2, fields });
    }
    return errors;
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

  private toResponse(
    contact: object,
  ): Record<string, unknown> & { id: string; leadStatus: CustomerLeadStatus } {
    const record = contact as unknown as Record<string, unknown>;
    const { _id, __v, organizationId, ...response } = record;
    void __v;
    void organizationId;
    return {
      id: String(_id),
      ...response,
      leadStatus:
        (response.leadStatus as CustomerLeadStatus | undefined) ??
        CustomerLeadStatus.NEW,
    };
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
