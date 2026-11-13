import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CustomerCrmLink } from '../../database/schemas/customer-crm-link.schema';

@Injectable()
export class ContactCrmLinksRepository {
  constructor(
    @InjectModel(CustomerCrmLink.name)
    private readonly links: Model<CustomerCrmLink>,
  ) {}

  async create(input: Record<string, unknown>) {
    const link = await this.links.create(input);
    return link.toObject() as unknown as Record<string, unknown>;
  }

  list(organizationId: string, contactId: string) {
    return this.links
      .find({ organizationId, contactId })
      .sort({ createdAt: -1, _id: -1 })
      .lean()
      .exec();
  }

  count(organizationId: string, contactId: string) {
    return this.links.countDocuments({ organizationId, contactId }).exec();
  }

  findByCrmRecord(organizationId: string, crmRecordId: string) {
    return this.links.findOne({ organizationId, crmRecordId }).lean().exec();
  }

  unlink(organizationId: string, contactId: string, crmRecordId: string) {
    return this.links
      .findOneAndDelete({ organizationId, contactId, crmRecordId })
      .lean()
      .exec();
  }
}
