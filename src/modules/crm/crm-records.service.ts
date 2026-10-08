import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { isValidObjectId } from 'mongoose';
import { CrmRecordsRepository } from './crm-records.repository';
import { ListCrmRecordsQueryDto } from './dto/list-crm-records-query.dto';

@Injectable()
export class CrmRecordsService {
  constructor(private readonly records: CrmRecordsRepository) {}

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
