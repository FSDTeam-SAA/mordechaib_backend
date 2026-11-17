import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import crypto from 'crypto';
import { createReadStream } from 'fs';
import { open } from 'fs/promises';
import path from 'path';
import { Types } from 'mongoose';
import { MessageAttachmentCategory } from '../../common/enums/message-attachment-category.enum';
import {
  SupportRequestActorType,
  SupportAttachmentStatus,
  SupportRequestEventType,
  SupportRequestPriority,
  SupportRequestStatus,
} from '../../common/enums/support-request.enum';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { AttachmentDisposition } from '../messages/dto/attachment-download-query.dto';
import { CloudinaryMessageAttachmentStorage } from '../messages/storage/cloudinary-message-attachment.storage';
import { MessageAttachmentStorageReference } from '../messages/storage/message-attachment-storage.interface';
import { CreateSupportRequestDto } from './dto/create-support-request.dto';
import { CreateSupportReplyDto } from './dto/create-support-reply.dto';
import { ListSupportRequestsAdminQueryDto } from './dto/list-support-requests-admin-query.dto';
import { ListSupportRequestsQueryDto } from './dto/list-support-requests-query.dto';
import { UpdateSupportRequestStatusDto } from './dto/update-support-request-status.dto';
import { ManageSupportRequestDto } from './dto/manage-support-request.dto';
import {
  isAllowedSupportAttachment,
  MAX_SUPPORT_ATTACHMENT_BYTES,
} from './support-request-upload.config';
import { SupportRequestsRepository } from './support-requests.repository';

type StoredAttachment = {
  originalName: string;
  mimeType: string;
  checksumSha256: string;
  storageProvider: string;
  storageKey: string;
  storageAssetId?: string;
  storageResourceType: string;
  storageDeliveryType: string;
  storageFormat: string;
  sizeBytes: number;
  url?: string;
};

type DetailedSupportRequest = Record<string, unknown> & {
  attachments: Array<Record<string, unknown>>;
  replies: Array<Record<string, unknown>>;
  timeline: Array<Record<string, unknown>>;
};

@Injectable()
export class SupportRequestsService {
  private readonly logger = new Logger(SupportRequestsService.name);

  constructor(
    private readonly repository: SupportRequestsRepository,
    private readonly storage: CloudinaryMessageAttachmentStorage,
    private readonly config: ConfigService,
    private readonly audits: AuditLogsService,
  ) {}

  async create(
    organizationId: string,
    userId: string,
    input: CreateSupportRequestDto,
    files: Express.Multer.File[] = [],
  ) {
    const requestId = new Types.ObjectId();
    const uploaded: StoredAttachment[] = [];

    try {
      for (const file of files) {
        await this.validateFile(file);
        const originalName = this.safeOriginalName(file.originalname);
        const checksumSha256 = await this.checksum(file.path);
        const mimeType = file.mimetype.toLowerCase();
        const category =
          mimeType === 'application/pdf'
            ? MessageAttachmentCategory.PDF
            : MessageAttachmentCategory.IMAGE;
        const stored = await this.storage.store({
          organizationId,
          conversationId: String(requestId),
          storageScopeId: String(requestId),
          storageFolder: this.config.get<string>(
            'cloudinary.supportFolder',
            'noltra/support-requests',
          ),
          storageTags: ['noltra-support-attachment'],
          uploadId: crypto.randomUUID(),
          localPath: file.path,
          originalName,
          mimeType,
          sizeBytes: file.size,
          category,
          visibility: 'PUBLIC',
        });
        uploaded.push({
          originalName,
          mimeType,
          checksumSha256,
          ...stored,
        });
      }

      let created: object | undefined;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          created = await this.repository.create({
            _id: requestId,
            ticketId: this.ticketId(),
            organizationId,
            createdByUserId: userId,
            category: input.category,
            subject: input.subject,
            description: input.description,
            status: SupportRequestStatus.OPEN,
            priority: SupportRequestPriority.MEDIUM,
            attachmentCount: uploaded.length,
            attachments: uploaded.map((attachment) => ({
              ...attachment,
              status: SupportAttachmentStatus.ACTIVE,
            })),
            timeline: [
              {
                type: SupportRequestEventType.CREATED,
                actorUserId: userId,
                actorType: SupportRequestActorType.ORGANIZER,
                createdAt: new Date(),
              },
            ],
          });
          break;
        } catch (error) {
          if (!this.isDuplicateKey(error) || attempt === 2) throw error;
        }
      }
      if (!created) throw new Error('Unable to create support request');

      await this.audit({
        organizationId,
        userId,
        action: 'SUPPORT_REQUEST_CREATED',
        resourceId: String(requestId),
        metadata: { attachmentCount: uploaded.length },
      });
      return this.publicRequest(created, true);
    } catch (error) {
      await this.cleanupStored(uploaded);
      throw error;
    }
  }

  async listForUser(
    organizationId: string,
    userId: string,
    query: ListSupportRequestsQueryDto,
  ) {
    const result = await this.repository.listForUser(
      organizationId,
      userId,
      query,
    );
    return this.paginated(result, query.page, query.limit, false);
  }

  async getForUser(organizationId: string, userId: string, id: string) {
    this.assertObjectId(id, 'requestId');
    const request = await this.repository.findForUser(
      organizationId,
      userId,
      id,
    );
    if (!request) throw new NotFoundException('Support request not found');
    return this.detailedRequest(request);
  }

  async getAttachmentForUser(
    organizationId: string,
    userId: string,
    requestId: string,
    attachmentId: string,
    disposition: AttachmentDisposition,
  ) {
    this.assertObjectId(requestId, 'requestId');
    this.assertObjectId(attachmentId, 'attachmentId');
    const request = await this.repository.findAttachmentForUser(
      organizationId,
      userId,
      requestId,
      attachmentId,
    );
    if (!request) throw new NotFoundException('Attachment not found');
    return this.attachmentDownload(request, attachmentId, disposition);
  }

  async remove(organizationId: string, userId: string, id: string) {
    this.assertObjectId(id, 'requestId');
    const request = await this.repository.softDelete(
      organizationId,
      userId,
      id,
      new Date(),
    );
    if (!request) throw new NotFoundException('Support request not found');

    const data = request as unknown as Record<string, unknown>;
    const attachments = (data.attachments || []) as Array<
      Record<string, unknown>
    >;
    let cleanupComplete = true;
    for (const attachment of attachments.filter(
      (item) => item.status === SupportAttachmentStatus.DELETION_PENDING,
    )) {
      const attachmentId = String(attachment._id);
      try {
        await this.storage.delete(this.storageReference(attachment));
        await this.repository.markAttachmentDeleted(id, attachmentId);
      } catch (error) {
        cleanupComplete = false;
        const message =
          error instanceof Error ? error.message : 'Storage cleanup failed';
        await this.repository.markAttachmentDeleteFailed(
          id,
          attachmentId,
          message,
        );
        this.logger.warn(
          `Support attachment cleanup failed for ${attachmentId}: ${message}`,
        );
      }
    }

    await this.audit({
      organizationId,
      userId,
      action: 'SUPPORT_REQUEST_DELETED',
      resourceId: id,
      metadata: { cleanupComplete },
    });
    return { requestId: id, deleted: true, cleanupComplete };
  }

  async listForAdmin(query: ListSupportRequestsAdminQueryDto) {
    const result = await this.repository.listForAdmin(query);
    const enriched = await this.enrichDirectory(result.items);
    return this.paginated(
      { items: enriched, total: result.total },
      query.page,
      query.limit,
      false,
    );
  }

  summaryForAdmin() {
    return this.repository.summaryForAdmin();
  }

  async listAssignableAdmins() {
    const users = await this.repository.listAssignableAdmins();
    return users.map((user) => ({
      id: String(user._id),
      name: `${user.firstName} ${user.lastName}`.trim(),
      email: user.email,
      avatarUrl: user.avatarUrl,
    }));
  }

  async getForAdmin(id: string) {
    this.assertObjectId(id, 'requestId');
    const request = await this.repository.findForAdmin(id);
    if (!request) throw new NotFoundException('Support request not found');
    return this.detailedRequest(request);
  }

  async getAttachmentForAdmin(
    requestId: string,
    attachmentId: string,
    disposition: AttachmentDisposition,
  ) {
    this.assertObjectId(requestId, 'requestId');
    this.assertObjectId(attachmentId, 'attachmentId');
    const request = await this.repository.findAttachmentForAdmin(
      requestId,
      attachmentId,
    );
    if (!request) throw new NotFoundException('Attachment not found');
    return this.attachmentDownload(request, attachmentId, disposition);
  }

  async updateStatus(
    id: string,
    input: UpdateSupportRequestStatusDto,
    adminUserId: string,
  ) {
    this.assertObjectId(id, 'requestId');
    return this.manage(
      id,
      { status: input.status, resolutionNote: input.resolutionNote },
      adminUserId,
    );
  }

  async manage(
    id: string,
    input: ManageSupportRequestDto,
    adminUserId: string,
  ) {
    this.assertObjectId(id, 'requestId');
    if (
      input.status === undefined &&
      input.priority === undefined &&
      input.assignedToUserId === undefined &&
      input.resolutionNote === undefined
    ) {
      throw new BadRequestException('At least one ticket field is required');
    }
    const current = await this.repository.findForAdmin(id);
    if (!current) throw new NotFoundException('Support request not found');
    const currentData = current as unknown as Record<string, unknown>;
    if (input.status) {
      this.assertStatusTransition(
        currentData.status as SupportRequestStatus,
        input.status,
      );
    }
    if (typeof input.assignedToUserId === 'string') {
      const assignee = await this.repository.findAssignableAdmin(
        input.assignedToUserId,
      );
      if (!assignee) {
        throw new BadRequestException(
          'assignedToUserId must identify an active platform admin',
        );
      }
    }

    const request = await this.repository.manage(id, input, adminUserId);
    if (!request) throw new NotFoundException('Support request not found');
    const data = request as unknown as Record<string, unknown>;
    await this.audit({
      organizationId: String(data.organizationId),
      userId: adminUserId,
      action: 'SUPPORT_REQUEST_MANAGED',
      resourceId: id,
      metadata: {
        ...(input.status ? { status: input.status } : {}),
        ...(input.priority ? { priority: input.priority } : {}),
        ...(input.assignedToUserId !== undefined
          ? { assignedToUserId: input.assignedToUserId }
          : {}),
      },
    });
    return this.detailedRequest(request);
  }

  async replyForUser(
    organizationId: string,
    userId: string,
    id: string,
    input: CreateSupportReplyDto,
  ) {
    this.assertObjectId(id, 'requestId');
    const current = await this.repository.findForUser(
      organizationId,
      userId,
      id,
    );
    if (!current) throw new NotFoundException('Support request not found');
    if (
      (current as unknown as Record<string, unknown>).status ===
      SupportRequestStatus.CLOSED
    ) {
      throw new BadRequestException('Closed support requests cannot be replied to');
    }
    const request = await this.repository.addReplyForUser(
      organizationId,
      userId,
      id,
      input.content,
      (current as unknown as Record<string, unknown>)
        .status as SupportRequestStatus,
    );
    if (!request) throw new NotFoundException('Support request not found');
    await this.audit({
      organizationId,
      userId,
      action: 'SUPPORT_REQUEST_REPLIED',
      resourceId: id,
    });
    return this.detailedRequest(request);
  }

  async replyForAdmin(
    id: string,
    adminUserId: string,
    input: CreateSupportReplyDto,
  ) {
    this.assertObjectId(id, 'requestId');
    const current = await this.repository.findForAdmin(id);
    if (!current) throw new NotFoundException('Support request not found');
    if (
      (current as unknown as Record<string, unknown>).status ===
      SupportRequestStatus.CLOSED
    ) {
      throw new BadRequestException('Closed support requests cannot be replied to');
    }
    const request = await this.repository.addReplyForAdmin(
      id,
      adminUserId,
      input.content,
    );
    if (!request) throw new NotFoundException('Support request not found');
    const data = request as unknown as Record<string, unknown>;
    await this.audit({
      organizationId: String(data.organizationId),
      userId: adminUserId,
      action: 'SUPPORT_REQUEST_REPLIED',
      resourceId: id,
    });
    return this.detailedRequest(request);
  }

  private async attachmentDownload(
    request: object,
    attachmentId: string,
    disposition: AttachmentDisposition,
  ) {
    const data = request as unknown as Record<string, unknown>;
    const attachments = data.attachments as Array<Record<string, unknown>>;
    const attachment = attachments.find(
      (item) => String(item._id) === attachmentId,
    );
    if (!attachment) throw new NotFoundException('Attachment not found');
    const result = await this.storage.getDownload(
      this.storageReference(attachment),
      disposition,
    );
    return {
      attachmentId,
      originalName: attachment.originalName,
      mimeType: attachment.mimeType,
      ...result,
    };
  }

  private async detailedRequest(
    value: object,
  ): Promise<DetailedSupportRequest> {
    const [enriched] = await this.enrichDirectory([value]);
    const response = this.publicRequest(enriched, true) as Record<
      string,
      unknown
    >;
    const source = value as unknown as Record<string, unknown>;
    const storedAttachments = (source.attachments || []) as Array<
      Record<string, unknown>
    >;
    const publicAttachments = (response.attachments || []) as Array<
      Record<string, unknown>
    >;

    return {
      ...response,
      attachments: await Promise.all(
        publicAttachments.map(async (attachment) => {
          const stored = storedAttachments.find(
            (item) => String(item._id) === String(attachment.id),
          );
          if (!stored) return attachment;
          if (typeof stored.url === 'string' && stored.url) {
            return { ...attachment, url: stored.url };
          }
          // Legacy support attachments were stored as authenticated assets.
          // Keep them viewable until they are re-uploaded as public assets.
          const download = await this.storage.getDownload(
            this.storageReference(stored),
            AttachmentDisposition.INLINE,
          );
          return { ...attachment, url: download.downloadUrl };
        }),
      ),
    } as DetailedSupportRequest;
  }

  private publicRequest(value: object, includeDetails: boolean) {
    const data = value as unknown as Record<string, unknown>;
    const attachments = (data.attachments || []) as Array<
      Record<string, unknown>
    >;
    return {
      id: String(data._id),
      ticketId: data.ticketId,
      organizationId: data.organizationId,
      createdByUserId: data.createdByUserId,
      category: data.category,
      subject: data.subject,
      ...(includeDetails ? { description: data.description } : {}),
      status: data.status,
      priority: data.priority || SupportRequestPriority.MEDIUM,
      assignedToUserId: data.assignedToUserId,
      assignedTo: data.assignedTo,
      organization: data.organization,
      contact: data.contact,
      resolutionNote: data.resolutionNote,
      statusChangedAt: data.statusChangedAt,
      attachmentCount:
        typeof data.attachmentCount === 'number'
          ? data.attachmentCount
          : attachments.filter(
              (item) => item.status === SupportAttachmentStatus.ACTIVE,
            ).length,
      ...(includeDetails
        ? {
            attachments: attachments
              .filter((item) => item.status === SupportAttachmentStatus.ACTIVE)
              .map((item) => ({
                id: String(item._id),
                originalName: item.originalName,
                mimeType: item.mimeType,
                sizeBytes: item.sizeBytes,
                createdAt: item.createdAt,
                ...(typeof item.url === 'string' && item.url
                  ? { url: item.url }
                  : {}),
              })),
            replies: data.replies || [],
            timeline: this.timelineWithCreatedFallback(data),
          }
        : {}),
      createdAt: data.createdAt,
      updatedAt: data.updatedAt,
    };
  }

  private paginated(
    result: { items: object[]; total: number },
    page: number,
    limit: number,
    includeDetails: boolean,
  ) {
    return {
      items: result.items.map((item) =>
        this.publicRequest(item, includeDetails),
      ),
      pagination: {
        page,
        limit,
        total: result.total,
        pages: Math.ceil(result.total / limit),
      },
    };
  }

  private async validateFile(file: Express.Multer.File) {
    if (!file.path) {
      throw new BadRequestException('Attachment upload was not stored safely');
    }
    if (!isAllowedSupportAttachment(file.originalname, file.mimetype)) {
      throw new BadRequestException(
        `Unsupported attachment type: ${this.safeOriginalName(file.originalname)}`,
      );
    }
    if (file.size <= 0) {
      throw new BadRequestException('Empty attachments are not allowed');
    }
    if (file.size > MAX_SUPPORT_ATTACHMENT_BYTES) {
      throw new BadRequestException('Attachment exceeds the 10 MB limit');
    }

    const handle = await open(file.path, 'r');
    try {
      const header = Buffer.alloc(8);
      await handle.read(header, 0, header.length, 0);
      const mimeType = file.mimetype.toLowerCase();
      const valid =
        (mimeType === 'application/pdf' &&
          header.subarray(0, 5).toString() === '%PDF-') ||
        (mimeType === 'image/jpeg' &&
          header[0] === 0xff &&
          header[1] === 0xd8 &&
          header[2] === 0xff) ||
        (mimeType === 'image/png' &&
          header.equals(
            Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
          ));
      if (!valid) {
        throw new BadRequestException(
          `Attachment content does not match ${mimeType}`,
        );
      }
    } finally {
      await handle.close();
    }
  }

  private ticketId() {
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    return `SUP-${date}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
  }

  private safeOriginalName(originalName: string) {
    const safe = Array.from(path.basename(originalName))
      .filter((character) => {
        const code = character.charCodeAt(0);
        return code >= 32 && code !== 127;
      })
      .join('');
    return (safe || 'attachment').slice(0, 255);
  }

  private checksum(filePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const hash = crypto.createHash('sha256');
      const stream = createReadStream(filePath);
      stream.on('error', reject);
      stream.on('data', (chunk) => hash.update(chunk));
      stream.on('end', () => resolve(hash.digest('hex')));
    });
  }

  private async cleanupStored(attachments: StoredAttachment[]) {
    const results = await Promise.allSettled(
      attachments.map((attachment) =>
        this.storage.delete(this.storageReference(attachment)),
      ),
    );
    results.forEach((result, index) => {
      if (result.status === 'rejected') {
        this.logger.error(
          `Unable to roll back support attachment ${attachments[index].storageKey}`,
        );
      }
    });
  }

  private storageReference(
    value: Record<string, unknown> | StoredAttachment,
  ): MessageAttachmentStorageReference {
    return {
      storageKey: String(value.storageKey),
      storageAssetId: value.storageAssetId
        ? String(value.storageAssetId)
        : undefined,
      storageResourceType: String(value.storageResourceType),
      storageDeliveryType: String(value.storageDeliveryType),
      storageFormat: String(value.storageFormat),
    };
  }

  private assertObjectId(value: string, name: string) {
    if (!Types.ObjectId.isValid(value)) {
      throw new BadRequestException(`${name} must be a valid MongoDB id`);
    }
  }

  private assertStatusTransition(
    current: SupportRequestStatus,
    next: SupportRequestStatus,
  ) {
    if (current === next) return;
    const allowed: Record<SupportRequestStatus, SupportRequestStatus[]> = {
      [SupportRequestStatus.OPEN]: [
        SupportRequestStatus.IN_PROGRESS,
        SupportRequestStatus.RESOLVED,
        SupportRequestStatus.CLOSED,
      ],
      [SupportRequestStatus.IN_PROGRESS]: [
        SupportRequestStatus.OPEN,
        SupportRequestStatus.RESOLVED,
        SupportRequestStatus.CLOSED,
      ],
      [SupportRequestStatus.RESOLVED]: [
        SupportRequestStatus.OPEN,
        SupportRequestStatus.CLOSED,
      ],
      [SupportRequestStatus.CLOSED]: [SupportRequestStatus.OPEN],
    };
    if (!allowed[current].includes(next)) {
      throw new BadRequestException(
        `Support request cannot transition from ${current} to ${next}`,
      );
    }
  }

  private timelineWithCreatedFallback(data: Record<string, unknown>) {
    const timeline = Array.isArray(data.timeline) ? data.timeline : [];
    if (
      timeline.some(
        (item) =>
          (item as Record<string, unknown>).type ===
          SupportRequestEventType.CREATED,
      )
    ) {
      return timeline;
    }
    return [
      {
        id: `legacy-created-${String(data._id)}`,
        type: SupportRequestEventType.CREATED,
        actorUserId: data.createdByUserId,
        actorType: SupportRequestActorType.ORGANIZER,
        actor: data.contact,
        createdAt: data.createdAt,
      },
      ...timeline,
    ];
  }

  private async enrichDirectory(items: object[]) {
    const records = items.map(
      (item) => item as unknown as Record<string, unknown>,
    );
    const organizationIds = new Set<string>();
    const userIds = new Set<string>();
    for (const item of records) {
      if (item.organizationId) organizationIds.add(String(item.organizationId));
      if (item.createdByUserId) userIds.add(String(item.createdByUserId));
      if (item.assignedToUserId) userIds.add(String(item.assignedToUserId));
      for (const reply of (item.replies || []) as Array<Record<string, unknown>>) {
        if (reply.authorUserId) userIds.add(String(reply.authorUserId));
      }
      for (const event of (item.timeline || []) as Array<
        Record<string, unknown>
      >) {
        if (event.actorUserId) userIds.add(String(event.actorUserId));
      }
    }
    const [organizations, users] = await Promise.all([
      this.repository.findOrganizationsByIds([...organizationIds]),
      this.repository.findUsersByIds([...userIds]),
    ]);
    const organizationMap = new Map(
      organizations.map((item) => [String(item._id), item]),
    );
    const userMap = new Map(users.map((item) => [String(item._id), item]));
    const publicUser = (id: unknown) => {
      const user = id ? userMap.get(String(id)) : undefined;
      if (!user) return null;
      return {
        id: String(user._id),
        name: `${user.firstName} ${user.lastName}`.trim(),
        email: user.email,
        avatarUrl: user.avatarUrl,
      };
    };

    return records.map((item) => {
      const organization = organizationMap.get(String(item.organizationId));
      return {
        ...item,
        organization: organization
          ? { id: String(organization._id), name: organization.name }
          : null,
        contact: publicUser(item.createdByUserId),
        assignedTo: publicUser(item.assignedToUserId),
        replies: ((item.replies || []) as Array<Record<string, unknown>>).map(
          (reply) => ({
            id: String(reply._id),
            authorUserId: reply.authorUserId,
            authorType: reply.authorType,
            author: publicUser(reply.authorUserId),
            content: reply.content,
            createdAt: reply.createdAt,
          }),
        ),
        timeline: ((item.timeline || []) as Array<Record<string, unknown>>).map(
          (event) => ({
            id: String(event._id),
            type: event.type,
            actorUserId: event.actorUserId,
            actorType: event.actorType,
            actor: publicUser(event.actorUserId),
            fromValue: event.fromValue,
            toValue: event.toValue,
            createdAt: event.createdAt,
          }),
        ),
      };
    });
  }

  private isDuplicateKey(error: unknown) {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 11000
    );
  }

  private async audit(input: {
    organizationId: string;
    userId: string;
    action: string;
    resourceId: string;
    metadata?: Record<string, unknown>;
  }) {
    try {
      await this.audits.create({
        ...input,
        resourceType: 'SUPPORT_REQUEST',
      });
    } catch (error) {
      this.logger.warn(
        `Unable to write support audit log: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
    }
  }
}
