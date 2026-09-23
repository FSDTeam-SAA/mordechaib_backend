import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import crypto from 'crypto';
import { isEmail, isUUID } from 'class-validator';
import { isValidObjectId, Model } from 'mongoose';
import { InjectModel } from '@nestjs/mongoose';
import {
  EmailDraftStatus,
  EmailProvider,
} from '../../common/enums/email-provider.enum';
import { UserRole } from '../../common/enums/user-role.enum';
import { UserStatus } from '../../common/enums/user-status.enum';
import { User } from '../../database/schemas/user.schema';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { CreateEmailDraftDto } from './dto/create-email-draft.dto';
import { ListEmailDraftsDto } from './dto/list-email-drafts.dto';
import { UpdateEmailDraftDto } from './dto/update-email-draft.dto';
import { EmailConnectionsService } from './email-connections.service';
import {
  EmailDraftsRepository,
  EmailDraftValues,
} from './email-drafts.repository';
import { EmailProviderClient, EmailSendError } from './email-provider.client';

@Injectable()
export class EmailDraftsService {
  private readonly logger = new Logger(EmailDraftsService.name);

  constructor(
    private readonly repository: EmailDraftsRepository,
    private readonly connections: EmailConnectionsService,
    private readonly providerClient: EmailProviderClient,
    private readonly audits: AuditLogsService,
    @InjectModel(User.name) private readonly users: Model<User>,
  ) {}

  async create(
    organizationId: string,
    userId: string,
    input: CreateEmailDraftDto,
  ) {
    const values = this.normalize(input);
    if (input.clientDraftId && !isUUID(input.clientDraftId)) {
      throw new BadRequestException('clientDraftId must be a UUID');
    }
    if (input.clientDraftId) {
      const existing = await this.repository.findByClientId(
        organizationId,
        userId,
        input.clientDraftId,
      );
      if (existing) return this.assertSameClientDraft(existing, values);
    }
    try {
      const draft = await this.repository.createManual(organizationId, userId, {
        ...values,
        ...(input.clientDraftId ? { clientDraftId: input.clientDraftId } : {}),
      });
      return this.publicDraft(
        draft.toObject() as unknown as Record<string, unknown>,
      );
    } catch (error) {
      if (!input.clientDraftId || !this.isDuplicateKey(error)) throw error;
      const existing = await this.repository.findByClientId(
        organizationId,
        userId,
        input.clientDraftId,
      );
      if (!existing) throw error;
      return this.assertSameClientDraft(existing, values);
    }
  }

  async ensureFromAiReply(input: {
    organizationId: string;
    userId: string;
    conversationId: string;
    sourceMessageId: string;
    aiResponseId: string;
    draft: EmailDraftValues;
  }) {
    const owner = await this.users
      .findOne({
        _id: input.userId,
        organizationId: input.organizationId,
        role: UserRole.OWNER,
        status: UserStatus.ACTIVE,
      })
      .lean()
      .exec();
    if (!owner) return undefined;
    const values = this.normalize(input.draft);
    const saved = await this.repository.ensureAiDraft({
      organizationId: input.organizationId,
      userId: input.userId,
      sourceConversationId: input.conversationId,
      sourceMessageId: input.sourceMessageId,
      sourceAiResponseId: input.aiResponseId,
      values,
    });
    if (!saved || saved.userId !== input.userId) {
      throw new ConflictException(
        'AI email draft identity conflicts with an existing draft',
      );
    }
    return this.publicDraft(saved);
  }

  async list(
    organizationId: string,
    userId: string,
    query: ListEmailDraftsDto,
  ) {
    const result = await this.repository.list(
      organizationId,
      userId,
      query.page,
      query.limit,
    );
    return {
      items: result.items.map((item) => this.publicDraft(item)),
      pagination: {
        page: query.page,
        limit: query.limit,
        total: result.total,
        pages: Math.ceil(result.total / query.limit),
      },
    };
  }

  async get(organizationId: string, userId: string, id: string) {
    this.assertId(id);
    const draft = await this.repository.find(organizationId, userId, id);
    if (!draft) throw new NotFoundException('Email draft not found');
    return this.publicDraft(draft);
  }

  async update(
    organizationId: string,
    userId: string,
    id: string,
    input: UpdateEmailDraftDto,
  ) {
    this.assertId(id);
    const changes = this.normalizePartial(input);
    if (!Object.keys(changes).length) {
      throw new BadRequestException('No email draft changes were provided');
    }
    const updated = await this.repository.update(
      organizationId,
      userId,
      id,
      changes,
    );
    if (updated) return this.publicDraft(updated);
    const existing = await this.repository.find(organizationId, userId, id);
    if (!existing) throw new NotFoundException('Email draft not found');
    throw new ConflictException('Only an unsent draft can be edited');
  }

  async send(
    organizationId: string,
    userId: string,
    id: string,
    expectedRevision: number,
    selectedProvider?: EmailProvider,
  ) {
    this.assertId(id);
    const draft = await this.repository.find(organizationId, userId, id);
    if (!draft) throw new NotFoundException('Email draft not found');
    if (draft.status === EmailDraftStatus.SENT) return this.publicDraft(draft);
    if (draft.revision !== expectedRevision) {
      throw new ConflictException(
        'Email draft changed; review the latest version before sending',
      );
    }
    const provider = selectedProvider || draft.provider;
    if (!provider || !Object.values(EmailProvider).includes(provider)) {
      throw new BadRequestException('Select a connected email provider');
    }
    if (
      draft.provider &&
      selectedProvider &&
      draft.provider !== selectedProvider
    ) {
      throw new BadRequestException(
        'Draft provider does not match selected provider',
      );
    }
    if (
      ![EmailDraftStatus.DRAFT, EmailDraftStatus.FAILED].includes(draft.status)
    ) {
      throw new ConflictException(
        'This email may already have been sent; check the provider Sent Items',
      );
    }
    const connection = await this.connections.accessToken(
      organizationId,
      userId,
      provider,
    );
    const attemptId = crypto.randomUUID();
    const claimed = await this.repository.claimSend(
      organizationId,
      userId,
      id,
      provider,
      attemptId,
      expectedRevision,
    );
    if (!claimed) {
      throw new ConflictException('Email send is already in progress');
    }
    try {
      await this.audits.create({
        organizationId,
        userId,
        action: 'EMAIL_SEND_REQUESTED',
        resourceType: 'EMAIL_DRAFT',
        resourceId: id,
        metadata: { provider, attemptId, recipientCount: claimed.to.length },
      });
    } catch {
      await this.repository.markFailure(
        organizationId,
        id,
        attemptId,
        EmailDraftStatus.FAILED,
        'Send audit could not be recorded',
      );
      throw new ServiceUnavailableException('Send audit is unavailable');
    }

    let confirmation: { providerMessageId?: string };
    try {
      confirmation = await this.providerClient.send(
        provider,
        connection.token,
        {
          from: connection.email,
          to: claimed.to,
          subject: claimed.subject,
          body: claimed.body,
        },
      );
    } catch (error) {
      const knownFailure =
        error instanceof EmailSendError && error.definitelyNotSent;
      const status = knownFailure
        ? EmailDraftStatus.FAILED
        : EmailDraftStatus.UNKNOWN;
      const message =
        error instanceof Error
          ? error.message
          : 'Email provider response is unknown';
      await this.repository.markFailure(
        organizationId,
        id,
        attemptId,
        status,
        message,
      );
      await this.auditOutcome(
        organizationId,
        userId,
        id,
        provider,
        attemptId,
        status,
      );
      if (knownFailure) throw new BadGatewayException(message);
      throw new ConflictException(
        'Email send result is unknown; check Sent Items before taking further action',
      );
    }

    const sent = await this.repository.markSent(
      organizationId,
      id,
      attemptId,
      connection.email,
      confirmation.providerMessageId,
    );
    if (!sent) {
      throw new ServiceUnavailableException(
        'Email was accepted by the provider, but local confirmation could not be saved',
      );
    }
    await this.auditOutcome(
      organizationId,
      userId,
      id,
      provider,
      attemptId,
      EmailDraftStatus.SENT,
    );
    return this.publicDraft(sent);
  }

  private async auditOutcome(
    organizationId: string,
    userId: string,
    draftId: string,
    provider: EmailProvider,
    attemptId: string,
    status: EmailDraftStatus,
  ) {
    try {
      await this.audits.create({
        organizationId,
        userId,
        action:
          status === EmailDraftStatus.SENT
            ? 'EMAIL_SEND_ACCEPTED'
            : 'EMAIL_SEND_FAILED',
        resourceType: 'EMAIL_DRAFT',
        resourceId: draftId,
        metadata: { provider, attemptId, status },
      });
    } catch {
      this.logger.warn(`Email send outcome audit failed for draft ${draftId}`);
    }
  }

  private normalize(input: EmailDraftValues): EmailDraftValues {
    const to = Array.isArray(input.to)
      ? [...new Set(input.to.map((email) => email.trim().toLowerCase()))]
      : [];
    const subject =
      typeof input.subject === 'string' ? input.subject.trim() : '';
    const body = typeof input.body === 'string' ? input.body : '';
    if (
      !to.length ||
      to.length > 10 ||
      to.some((email) => !isEmail(email)) ||
      !subject ||
      subject.length > 300 ||
      !body.trim() ||
      body.length > 20_000
    ) {
      throw new BadRequestException(
        'Email draft recipients, subject, or body are invalid',
      );
    }
    if (
      input.provider &&
      !Object.values(EmailProvider).includes(input.provider)
    ) {
      throw new BadRequestException('Email provider is invalid');
    }
    return {
      ...(input.provider ? { provider: input.provider } : {}),
      to,
      subject,
      body,
    };
  }

  private normalizePartial(
    input: UpdateEmailDraftDto,
  ): Partial<EmailDraftValues> {
    const changes: Partial<EmailDraftValues> = {};
    if (input.provider !== undefined) {
      if (!Object.values(EmailProvider).includes(input.provider)) {
        throw new BadRequestException('Email provider is invalid');
      }
      changes.provider = input.provider;
    }
    if (input.to !== undefined) {
      if (
        !Array.isArray(input.to) ||
        input.to.some((email) => typeof email !== 'string')
      ) {
        throw new BadRequestException('Email recipients are invalid');
      }
      const to = [
        ...new Set(input.to.map((email) => email.trim().toLowerCase())),
      ];
      if (!to.length || to.length > 10 || to.some((email) => !isEmail(email))) {
        throw new BadRequestException('Email recipients are invalid');
      }
      changes.to = to;
    }
    if (input.subject !== undefined) {
      const subject = input.subject.trim();
      if (!subject || subject.length > 300) {
        throw new BadRequestException('Email subject is invalid');
      }
      changes.subject = subject;
    }
    if (input.body !== undefined) {
      if (!input.body.trim() || input.body.length > 20_000) {
        throw new BadRequestException('Email body is invalid');
      }
      changes.body = input.body;
    }
    return changes;
  }

  private assertSameClientDraft(
    existing: Record<string, unknown>,
    values: EmailDraftValues,
  ) {
    if (
      existing.provider !== values.provider ||
      existing.subject !== values.subject ||
      existing.body !== values.body ||
      JSON.stringify(existing.to) !== JSON.stringify(values.to)
    ) {
      throw new ConflictException(
        'clientDraftId was reused with different content',
      );
    }
    return this.publicDraft(existing);
  }

  private publicDraft(value: Record<string, unknown>) {
    return {
      id: String(value._id),
      provider: value.provider,
      to: value.to,
      subject: value.subject,
      body: value.body,
      status: value.status,
      revision: value.revision,
      sourceMessageId: value.sourceMessageId,
      sourceConversationId: value.sourceConversationId,
      sourceAiResponseId: value.sourceAiResponseId,
      sentFrom: value.sentFrom,
      sentAt: value.sentAt,
      providerMessageId: value.providerMessageId,
      lastError: value.lastError,
      createdAt: value.createdAt,
      updatedAt: value.updatedAt,
    };
  }

  private assertId(id: string) {
    if (!isValidObjectId(id)) {
      throw new BadRequestException('Invalid email draft id');
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
}
