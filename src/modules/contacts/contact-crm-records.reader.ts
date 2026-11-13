import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { isValidObjectId, Model } from 'mongoose';
import { CrmRecord } from '../../database/schemas/crm-record.schema';

@Injectable()
export class ContactCrmRecordsReader {
  constructor(
    @InjectModel(CrmRecord.name)
    private readonly records: Model<CrmRecord>,
  ) {}

  async get(organizationId: string, id: string) {
    this.assertIds([id]);
    const record = await this.records
      .findOne({ _id: id, organizationId })
      .lean()
      .exec();
    if (!record) throw new NotFoundException('CRM record not found');
    return this.toResponse(record);
  }

  async getMany(organizationId: string, ids: string[]) {
    const uniqueIds = [...new Set(ids)];
    if (!uniqueIds.length) return [];
    this.assertIds(uniqueIds);
    const records = await this.records
      .find({ organizationId, _id: { $in: uniqueIds } })
      .lean()
      .exec();
    return records.map((record) => this.toResponse(record));
  }

  private assertIds(ids: string[]) {
    if (ids.some((id) => !isValidObjectId(id))) {
      throw new BadRequestException('CRM record ids must be valid MongoDB ids');
    }
  }

  private toResponse(record: object): Record<string, unknown> & { id: string } {
    const value = record as Record<string, unknown>;
    const { _id, __v, organizationId, rawPayload, ...response } = value;
    void __v;
    void organizationId;
    void rawPayload;
    return { id: String(_id), ...response };
  }
}
