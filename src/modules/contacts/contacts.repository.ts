import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model } from 'mongoose';
import { CustomerContactStatus } from '../../common/enums/customer-contact-status.enum';
import { CustomerContact } from '../../database/schemas/customer-contact.schema';
import { ListContactsQueryDto } from './dto/list-contacts-query.dto';

@Injectable()
export class ContactsRepository {
  constructor(
    @InjectModel(CustomerContact.name)
    private readonly contacts: Model<CustomerContact>,
  ) {}

  async create(input: Record<string, unknown>) {
    const contact = await this.contacts.create(input);
    return contact.toObject();
  }

  async list(organizationId: string, query: ListContactsQueryDto) {
    const escaped = query.search?.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const filter: FilterQuery<CustomerContact> = {
      organizationId,
      status: query.status,
      ...(escaped
        ? {
            $or: [
              { name: { $regex: escaped, $options: 'i' } },
              { email: { $regex: escaped, $options: 'i' } },
              { phone: { $regex: escaped, $options: 'i' } },
              { company: { $regex: escaped, $options: 'i' } },
              { tags: { $regex: escaped, $options: 'i' } },
            ],
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      this.contacts
        .find(filter)
        .sort({ updatedAt: -1, _id: -1 })
        .skip((query.page - 1) * query.limit)
        .limit(query.limit)
        .lean()
        .exec(),
      this.contacts.countDocuments(filter).exec(),
    ]);
    return { items, total };
  }

  findById(organizationId: string, id: string) {
    return this.contacts.findOne({ _id: id, organizationId }).lean().exec();
  }

  findActiveByIds(organizationId: string, ids: string[]) {
    return this.contacts
      .find({
        _id: { $in: ids },
        organizationId,
        status: CustomerContactStatus.ACTIVE,
      })
      .lean()
      .exec();
  }

  findDuplicate(
    organizationId: string,
    input: { email?: string; phone?: string },
    excludeId?: string,
  ) {
    const matches = [
      ...(input.email ? [{ email: input.email }] : []),
      ...(input.phone ? [{ phone: input.phone }] : []),
    ];
    if (!matches.length) return Promise.resolve(null);
    return this.contacts
      .findOne({
        organizationId,
        status: CustomerContactStatus.ACTIVE,
        ...(excludeId ? { _id: { $ne: excludeId } } : {}),
        $or: matches,
      })
      .lean()
      .exec();
  }

  update(organizationId: string, id: string, input: Record<string, unknown>) {
    return this.contacts
      .findOneAndUpdate(
        { _id: id, organizationId },
        { $set: input },
        { new: true, runValidators: true },
      )
      .lean()
      .exec();
  }

  archive(organizationId: string, id: string, userId: string) {
    return this.contacts
      .findOneAndUpdate(
        {
          _id: id,
          organizationId,
          status: CustomerContactStatus.ACTIVE,
        },
        {
          $set: {
            status: CustomerContactStatus.ARCHIVED,
            archivedAt: new Date(),
            archivedByUserId: userId,
          },
        },
        { new: true },
      )
      .lean()
      .exec();
  }
}
