import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import crypto from 'crypto';
import { isValidObjectId } from 'mongoose';
import { ContactEnquiryStatus } from '../../common/enums/contact-enquiry-status.enum';
import { sendEmail } from '../../common/helpers/mailer.helper';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { ContactEnquiriesRepository } from './contact-enquiries.repository';
import { CreateContactEnquiryDto } from './dto/create-contact-enquiry.dto';
import { ListContactEnquiriesQueryDto } from './dto/list-contact-enquiries-query.dto';
import { UpdateContactEnquiryDto } from './dto/update-contact-enquiry.dto';

type AdminIdentity = { id: string; organizationId: string };

@Injectable()
export class ContactEnquiriesService {
  private readonly logger = new Logger(ContactEnquiriesService.name);

  constructor(
    private readonly repository: ContactEnquiriesRepository,
    private readonly config: ConfigService,
    private readonly audits: AuditLogsService,
  ) {}

  async create(input: CreateContactEnquiryDto) {
    const values = this.createValues(input);
    const requestHash = this.hash(JSON.stringify(values));
    if (input.clientRequestId) {
      const existing = await this.repository.findByClientRequestId(
        input.clientRequestId,
      );
      if (existing) return this.replayed(existing, requestHash);
    }

    let created: Record<string, unknown>;
    try {
      created = (await this.repository.create({
        ...values,
        ...(input.clientRequestId
          ? { clientRequestId: input.clientRequestId }
          : {}),
        requestHash,
        referenceId: this.referenceId(),
        consentAcceptedAt: new Date(),
        status: ContactEnquiryStatus.NEW,
        revision: 1,
      })) as unknown as Record<string, unknown>;
    } catch (error) {
      if (!input.clientRequestId || !this.isDuplicateKey(error)) throw error;
      const existing = await this.repository.findByClientRequestId(
        input.clientRequestId,
      );
      if (!existing) throw error;
      return this.replayed(existing, requestHash);
    }

    await this.notify(created);
    return this.publicReceipt(created, false);
  }

  async list(query: ListContactEnquiriesQueryDto) {
    if (
      query.createdFrom &&
      query.createdTo &&
      new Date(query.createdFrom) > new Date(query.createdTo)
    ) {
      throw new BadRequestException('createdFrom must be before createdTo');
    }
    const result = await this.repository.list(query);
    return {
      items: result.items.map((item) => this.adminView(item)),
      pagination: {
        page: query.page,
        limit: query.limit,
        total: result.total,
        pages: Math.ceil(result.total / query.limit),
      },
    };
  }

  async get(id: string) {
    this.assertId(id);
    const enquiry = await this.repository.findById(id);
    if (!enquiry) throw new NotFoundException('Contact enquiry not found');
    return this.adminView(enquiry);
  }

  async update(id: string, input: UpdateContactEnquiryDto, admin: AdminIdentity) {
    this.assertId(id);
    const { expectedRevision, ...changes } = input;
    const values = Object.fromEntries(
      Object.entries(changes).filter(([, value]) => value !== undefined),
    );
    if (!Object.keys(values).length) {
      throw new BadRequestException('At least one update field is required');
    }
    const updated = await this.repository.update(
      id,
      expectedRevision,
      values,
      admin.id,
    );
    if (!updated) await this.throwMissingOrConflict(id);
    await this.audit(admin, 'CONTACT_ENQUIRY_UPDATED', id, {
      changedFields: Object.keys(values),
    });
    return this.adminView(updated!);
  }

  async remove(
    id: string,
    expectedRevision: number,
    admin: AdminIdentity,
  ) {
    this.assertId(id);
    const removed = await this.repository.softDelete(
      id,
      expectedRevision,
      admin.id,
      new Date(),
    );
    if (!removed) await this.throwMissingOrConflict(id);
    await this.audit(admin, 'CONTACT_ENQUIRY_DELETED', id);
    return { id, deleted: true };
  }

  private createValues(input: CreateContactEnquiryDto) {
    return {
      fullName: input.fullName,
      email: input.email,
      ...(input.company ? { company: input.company } : {}),
      ...(input.role ? { role: input.role } : {}),
      message: input.message,
    };
  }

  private replayed(existing: object, requestHash: string) {
    const value = existing as Record<string, unknown>;
    if (value.requestHash !== requestHash) {
      throw new ConflictException(
        'clientRequestId was reused with different enquiry data',
      );
    }
    return this.publicReceipt(value, true);
  }

  private publicReceipt(value: Record<string, unknown>, duplicate: boolean) {
    return {
      id: String(value._id),
      referenceId: value.referenceId,
      status: value.status,
      submittedAt: value.createdAt,
      duplicate,
    };
  }

  private adminView(value: object) {
    const record = value as Record<string, unknown>;
    return {
      id: String(record._id),
      referenceId: record.referenceId,
      fullName: record.fullName,
      email: record.email,
      company: record.company,
      role: record.role,
      message: record.message,
      status: record.status,
      internalNote: record.internalNote,
      consentAcceptedAt: record.consentAcceptedAt,
      statusChangedAt: record.statusChangedAt,
      statusChangedByUserId: record.statusChangedByUserId,
      revision: record.revision,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };
  }

  private async throwMissingOrConflict(id: string): Promise<never> {
    const existing = await this.repository.findById(id);
    if (!existing) throw new NotFoundException('Contact enquiry not found');
    throw new ConflictException(
      'Contact enquiry changed; refresh and retry with the latest revision',
    );
  }

  private async notify(enquiry: Record<string, unknown>) {
    const referenceId = String(enquiry.referenceId);
    const supportEmail = this.config.get<string>('mail.supportEmail');
    const notifications: Promise<boolean>[] = [];
    if (supportEmail) {
      notifications.push(
        sendEmail(this.config, {
          to: supportEmail,
          subject: `New contact enquiry ${referenceId}`,
          text: [
            `Reference: ${referenceId}`,
            `Name: ${String(enquiry.fullName)}`,
            `Email: ${String(enquiry.email)}`,
            `Company: ${String(enquiry.company || 'Not provided')}`,
            `Role: ${String(enquiry.role || 'Not provided')}`,
            '',
            String(enquiry.message),
          ].join('\n'),
        }),
      );
    } else {
      this.logger.warn(
        `Contact enquiry ${referenceId} notification skipped because SUPPORT_EMAIL is not configured`,
      );
    }
    notifications.push(
      sendEmail(this.config, {
        to: String(enquiry.email),
        subject: `We received your enquiry (${referenceId})`,
        text: [
          `Hello ${String(enquiry.fullName)},`,
          '',
          'Thank you for contacting Noltra.ai. Our team has received your enquiry and will respond as soon as possible.',
          `Reference: ${referenceId}`,
        ].join('\n'),
      }),
    );
    await Promise.all(notifications);
  }

  private async audit(
    admin: AdminIdentity,
    action: string,
    resourceId: string,
    metadata?: Record<string, unknown>,
  ) {
    try {
      await this.audits.create({
        organizationId: admin.organizationId,
        userId: admin.id,
        action,
        resourceType: 'CONTACT_ENQUIRY',
        resourceId,
        metadata,
      });
    } catch (error) {
      this.logger.warn(
        `Contact enquiry audit failed: ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      );
    }
  }

  private referenceId() {
    const date = new Date().toISOString().slice(0, 10).replaceAll('-', '');
    return `CONTACT-${date}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
  }

  private assertId(id: string) {
    if (!isValidObjectId(id)) throw new BadRequestException('Invalid enquiry id');
  }

  private hash(value: string) {
    return crypto.createHash('sha256').update(value).digest('hex');
  }

  private isDuplicateKey(error: unknown) {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 11000
    );
  }
}
