import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import crypto from 'crypto';
import { createReadStream } from 'fs';
import path from 'path';
import { isValidObjectId, Types } from 'mongoose';
import { CustomerFileStatus } from '../../common/enums/customer-file-status.enum';
import { MessageAttachmentCategory } from '../../common/enums/message-attachment-category.enum';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { AttachmentDisposition } from '../messages/dto/attachment-download-query.dto';
import { CloudinaryMessageAttachmentStorage } from '../messages/storage/cloudinary-message-attachment.storage';
import { MessageAttachmentStorageReference } from '../messages/storage/message-attachment-storage.interface';
import {
  MAX_CUSTOMER_FILE_BYTES,
  resolveCustomerFileCategory,
} from './contact-file-upload.config';
import { ContactFilesRepository } from './contact-files.repository';
import { ContactsService } from './contacts.service';
import { ListContactContentQueryDto } from './dto/list-contact-content-query.dto';

type StoredCustomerFile = {
  id: Types.ObjectId;
  category: MessageAttachmentCategory;
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
};

@Injectable()
export class ContactFilesService {
  private readonly logger = new Logger(ContactFilesService.name);

  constructor(
    private readonly repository: ContactFilesRepository,
    private readonly contacts: ContactsService,
    private readonly storage: CloudinaryMessageAttachmentStorage,
    private readonly config: ConfigService,
    private readonly audits: AuditLogsService,
  ) {}

  async upload(
    organizationId: string,
    userId: string,
    contactId: string,
    files: Express.Multer.File[] = [],
  ) {
    this.assertId(contactId, 'contactId');
    await this.contacts.assertActiveIds(organizationId, [contactId]);
    if (!files.length) {
      throw new BadRequestException('At least one customer file is required');
    }

    const uploaded: StoredCustomerFile[] = [];
    try {
      for (const file of files) {
        const category = this.validate(file);
        const id = new Types.ObjectId();
        const originalName = this.safeOriginalName(file.originalname);
        const mimeType = file.mimetype.toLowerCase();
        const checksumSha256 = await this.checksum(file.path);
        const stored = await this.storage.store({
          organizationId,
          conversationId: contactId,
          storageScopeId: contactId,
          storageFolder: this.config.get<string>(
            'cloudinary.customerFileFolder',
            'noltra/customer-files',
          ),
          storageTags: ['noltra-customer-file'],
          uploadId: String(id),
          localPath: file.path,
          originalName,
          mimeType,
          sizeBytes: file.size,
          category,
          visibility: 'PRIVATE',
        });
        uploaded.push({
          id,
          category,
          originalName,
          mimeType,
          checksumSha256,
          ...stored,
        });
      }

      const saved = await this.repository.createMany(
        uploaded.map((file) => ({
          _id: file.id,
          organizationId,
          contactId,
          uploadedByUserId: userId,
          category: file.category,
          originalName: file.originalName,
          mimeType: file.mimeType,
          sizeBytes: file.sizeBytes,
          checksumSha256: file.checksumSha256,
          storageProvider: file.storageProvider,
          storageKey: file.storageKey,
          storageAssetId: file.storageAssetId,
          storageResourceType: file.storageResourceType,
          storageDeliveryType: file.storageDeliveryType,
          storageFormat: file.storageFormat,
          status: CustomerFileStatus.ACTIVE,
        })),
      );
      await Promise.all(
        saved.map((file) =>
          this.audit(organizationId, userId, 'CUSTOMER_FILE_UPLOADED', file),
        ),
      );
      return { items: saved.map((file) => this.response(file)) };
    } catch (error) {
      await this.repository
        .hardDeleteByIds(uploaded.map((file) => String(file.id)))
        .catch((cleanupError: unknown) => {
          this.logger.error(
            `Unable to roll back customer-file records: ${cleanupError instanceof Error ? cleanupError.message : 'unknown error'}`,
          );
        });
      await this.cleanup(uploaded);
      throw error;
    }
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
      items: result.items.map((file) => this.response(file)),
      pagination: {
        page: query.page,
        limit: query.limit,
        total: result.total,
        pages: Math.ceil(result.total / query.limit),
      },
    };
  }

  async download(
    organizationId: string,
    contactId: string,
    fileId: string,
    disposition: AttachmentDisposition,
  ) {
    this.assertIds(contactId, fileId);
    await this.contacts.get(organizationId, contactId);
    const file = await this.repository.findWithStorage(
      organizationId,
      contactId,
      fileId,
    );
    if (!file) throw new NotFoundException('Customer file not found');
    const result = await this.storage.getDownload(
      this.storageReference(file),
      disposition,
    );
    return {
      fileId,
      originalName: file.originalName,
      mimeType: file.mimeType,
      ...result,
    };
  }

  async remove(
    organizationId: string,
    userId: string,
    contactId: string,
    fileId: string,
  ) {
    this.assertIds(contactId, fileId);
    await this.contacts.get(organizationId, contactId);
    const file = await this.repository.markDeletionPending(
      organizationId,
      contactId,
      fileId,
      userId,
    );
    if (!file) throw new NotFoundException('Customer file not found');
    let cleanupComplete = true;
    try {
      await this.storage.delete(this.storageReference(file));
      await this.repository.markDeleted(fileId);
    } catch (error) {
      cleanupComplete = false;
      const message =
        error instanceof Error ? error.message : 'Storage cleanup failed';
      await this.repository.markDeleteFailed(fileId, message);
      this.logger.warn(
        `Customer file cleanup failed for ${fileId}: ${message}`,
      );
    }
    await this.audit(organizationId, userId, 'CUSTOMER_FILE_DELETED', file, {
      cleanupComplete,
    });
    return { fileId, deleted: true, cleanupComplete };
  }

  private validate(file: Express.Multer.File) {
    const category = resolveCustomerFileCategory(
      file.originalname,
      file.mimetype,
    );
    if (!category) {
      throw new BadRequestException(
        `Unsupported customer file: ${this.safeOriginalName(file.originalname)}`,
      );
    }
    if (!file.path) {
      throw new BadRequestException('Customer file was not buffered safely');
    }
    if (file.size <= 0) {
      throw new BadRequestException('Empty customer files are not allowed');
    }
    if (file.size > MAX_CUSTOMER_FILE_BYTES) {
      throw new BadRequestException('Customer file exceeds the 20 MB limit');
    }
    return category;
  }

  private response(value: object) {
    const file = value as unknown as Record<string, unknown>;
    return {
      id: String(file._id),
      contactId: file.contactId,
      category: file.category,
      originalName: file.originalName,
      mimeType: file.mimeType,
      sizeBytes: file.sizeBytes,
      checksumSha256: file.checksumSha256,
      uploadedByUserId: file.uploadedByUserId,
      createdAt: file.createdAt,
      updatedAt: file.updatedAt,
    };
  }

  private safeOriginalName(value: string) {
    const safe = Array.from(path.basename(value))
      .filter((character) => {
        const code = character.charCodeAt(0);
        return code >= 32 && code !== 127;
      })
      .join('');
    return (safe || 'customer-file').slice(0, 255);
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

  private storageReference(
    file: MessageAttachmentStorageReference,
  ): MessageAttachmentStorageReference {
    return {
      storageKey: file.storageKey,
      storageAssetId: file.storageAssetId,
      storageResourceType: file.storageResourceType,
      storageDeliveryType: file.storageDeliveryType,
      storageFormat: file.storageFormat,
    };
  }

  private async cleanup(files: StoredCustomerFile[]) {
    const results = await Promise.allSettled(
      files.map((file) => this.storage.delete(this.storageReference(file))),
    );
    results.forEach((result, index) => {
      if (result.status === 'rejected') {
        this.logger.error(
          `Unable to roll back customer file ${files[index].storageKey}`,
        );
      }
    });
  }

  private assertIds(contactId: string, fileId: string) {
    this.assertId(contactId, 'contactId');
    this.assertId(fileId, 'fileId');
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
    file: object,
    metadata: Record<string, unknown> = {},
  ) {
    const record = file as unknown as Record<string, unknown>;
    try {
      await this.audits.create({
        organizationId,
        userId,
        action,
        resourceType: 'CUSTOMER_FILE',
        resourceId: String(record._id),
        metadata: {
          contactId: record.contactId,
          originalName: record.originalName,
          mimeType: record.mimeType,
          sizeBytes: record.sizeBytes,
          ...metadata,
        },
      });
    } catch (error) {
      this.logger.warn(
        `Unable to write customer-file audit: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
    }
  }
}
