import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { isValidObjectId } from 'mongoose';
import type { CrmProviderType } from '../../common/types/crm-provider.interface';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { CrmRecordMutationsService } from './crm-record-mutations.service';
import { CrmRecordsRepository } from './crm-records.repository';
import { CreateCrmRecordDto } from './dto/create-crm-record.dto';
import { ListCrmRecordsQueryDto } from './dto/list-crm-records-query.dto';
import { UpdateCrmRecordDto } from './dto/update-crm-record.dto';

@Injectable()
export class CrmRecordsService {
  constructor(
    private readonly records: CrmRecordsRepository,
    private readonly mutations: CrmRecordMutationsService,
    private readonly auditLogs: AuditLogsService,
  ) {}

  async create(
    organizationId: string,
    userId: string,
    provider: CrmProviderType,
    objectType: string,
    input: CreateCrmRecordDto,
  ) {
    const record = await this.mutations.executeCreate(organizationId, {
      provider,
      objectType,
      properties: input.properties,
    });
    await this.auditLogs.create({
      organizationId,
      userId,
      action: 'CRM_RECORD_CREATED',
      resourceType: 'crm_record',
      resourceId: record.externalId,
      metadata: {
        provider,
        objectType: record.objectType,
        localRecordId: String(record._id),
      },
    });
    return this.toResponse(record);
  }

  async update(
    organizationId: string,
    userId: string,
    provider: CrmProviderType,
    objectType: string,
    externalId: string,
    input: UpdateCrmRecordDto,
  ) {
    const record = await this.mutations.executeUpdate(organizationId, {
      provider,
      objectType,
      externalId,
      properties: input.properties,
      expectedProviderUpdatedAt: input.expectedProviderUpdatedAt,
    });
    await this.auditLogs.create({
      organizationId,
      userId,
      action: 'CRM_RECORD_UPDATED',
      resourceType: 'crm_record',
      resourceId: record.externalId,
      metadata: {
        provider,
        objectType: record.objectType,
        localRecordId: String(record._id),
        updatedFields: Object.keys(input.properties),
      },
    });
    return this.toResponse(record);
  }

  async list(organizationId: string, query: ListCrmRecordsQueryDto) {
    this.assertDateRange(query);
    const result = await this.records.list(organizationId, query);
    return {
      items: result.items.map((record) => this.toResponse(record)),
      pagination: {
        page: query.page,
        limit: query.limit,
        total: result.total,
        pages: Math.ceil(result.total / query.limit),
      },
    };
  }

  async get(organizationId: string, id: string) {
    if (!isValidObjectId(id)) {
      throw new BadRequestException('CRM record id must be a valid MongoDB id');
    }
    const record = await this.records.findById(organizationId, id);
    if (!record) throw new NotFoundException('CRM record not found');
    return this.toResponse(record);
  }

  private assertDateRange(query: ListCrmRecordsQueryDto) {
    if (
      query.updatedFrom &&
      query.updatedTo &&
      new Date(query.updatedFrom).getTime() >
        new Date(query.updatedTo).getTime()
    ) {
      throw new BadRequestException(
        'updatedFrom must be earlier than or equal to updatedTo',
      );
    }
  }

  private toResponse(record: object) {
    const value = record as Record<string, unknown>;
    const { _id, __v, organizationId, rawPayload, ...response } = value;
    void __v;
    void organizationId;
    void rawPayload;
    return { id: String(_id), ...response };
  }
}
