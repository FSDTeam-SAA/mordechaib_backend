import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { isValidObjectId } from 'mongoose';
import { CustomerNoteSource } from '../../common/enums/customer-note-source.enum';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { ContactNotesRepository } from './contact-notes.repository';
import { ContactsService } from './contacts.service';
import { CreateContactNoteDto } from './dto/create-contact-note.dto';
import { ListContactContentQueryDto } from './dto/list-contact-content-query.dto';
import { UpdateContactNoteDto } from './dto/update-contact-note.dto';

@Injectable()
export class ContactNotesService {
  private readonly logger = new Logger(ContactNotesService.name);

  constructor(
    private readonly repository: ContactNotesRepository,
    private readonly contacts: ContactsService,
    private readonly audits: AuditLogsService,
  ) {}

  async create(
    organizationId: string,
    userId: string,
    contactId: string,
    input: CreateContactNoteDto,
  ) {
    this.assertId(contactId, 'contactId');
    await this.contacts.assertActiveIds(organizationId, [contactId]);
    const content = this.content(input.content);
    const note = await this.repository.create({
      organizationId,
      contactId,
      createdByUserId: userId,
      content,
      source: CustomerNoteSource.MANUAL,
      revision: 1,
    });
    await this.audit(organizationId, userId, 'CUSTOMER_NOTE_CREATED', note, {
      preview: content.slice(0, 200),
    });
    return this.response(note);
  }

  async list(
    organizationId: string,
    contactId: string,
    query: ListContactContentQueryDto,
  ) {
    this.assertId(contactId, 'contactId');
    await this.contacts.get(organizationId, contactId);
    const result = await this.repository.list(organizationId, contactId, query);
    return {
      items: result.items.map((item) => this.response(item)),
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
    contactId: string,
    noteId: string,
    input: UpdateContactNoteDto,
  ) {
    this.assertIds(contactId, noteId);
    await this.contacts.assertActiveIds(organizationId, [contactId]);
    const content = this.content(input.content);
    const note = await this.repository.update(
      organizationId,
      contactId,
      noteId,
      userId,
      content,
      input.expectedRevision,
    );
    if (!note) {
      const existing = await this.repository.find(
        organizationId,
        contactId,
        noteId,
      );
      if (!existing) throw new NotFoundException('Customer note not found');
      throw new ConflictException(
        'Customer note changed; refresh it before editing again',
      );
    }
    await this.audit(organizationId, userId, 'CUSTOMER_NOTE_UPDATED', note, {
      revision: note.revision,
      preview: content.slice(0, 200),
    });
    return this.response(note);
  }

  async remove(
    organizationId: string,
    userId: string,
    contactId: string,
    noteId: string,
  ) {
    this.assertIds(contactId, noteId);
    await this.contacts.get(organizationId, contactId);
    const note = await this.repository.archive(
      organizationId,
      contactId,
      noteId,
      userId,
    );
    if (!note) throw new NotFoundException('Customer note not found');
    await this.audit(organizationId, userId, 'CUSTOMER_NOTE_DELETED', note);
    return { noteId, deleted: true };
  }

  private response(value: object) {
    const record = value as unknown as Record<string, unknown>;
    return {
      id: String(record._id),
      contactId: record.contactId,
      content: record.content,
      source: record.source,
      revision: record.revision,
      createdByUserId: record.createdByUserId,
      updatedByUserId: record.updatedByUserId,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };
  }

  private content(value: string) {
    const content = value.trim();
    if (!content) throw new BadRequestException('Note content is required');
    return content;
  }

  private assertIds(contactId: string, noteId: string) {
    this.assertId(contactId, 'contactId');
    this.assertId(noteId, 'noteId');
  }

  private assertId(value: string, field: string) {
    if (!isValidObjectId(value)) {
      throw new BadRequestException(`${field} must be a valid MongoDB id`);
    }
  }

  private async audit(
    organizationId: string,
    userId: string,
    action: string,
    note: object,
    metadata: Record<string, unknown> = {},
  ) {
    const record = note as unknown as Record<string, unknown>;
    try {
      await this.audits.create({
        organizationId,
        userId,
        action,
        resourceType: 'CUSTOMER_NOTE',
        resourceId: String(record._id),
        metadata: { contactId: record.contactId, ...metadata },
      });
    } catch (error) {
      this.logger.warn(
        `Unable to write customer-note audit: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
    }
  }
}
