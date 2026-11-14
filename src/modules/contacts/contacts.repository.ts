import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model } from 'mongoose';
import { CustomerContactStatus } from '../../common/enums/customer-contact-status.enum';
import { CustomerLeadStatus } from '../../common/enums/customer-lead-status.enum';
import { CustomerContact } from '../../database/schemas/customer-contact.schema';
import { ListContactsQueryDto } from './dto/list-contacts-query.dto';
import { CustomerHealthSnapshot } from '../../database/schemas/customer-health-snapshot.schema';
import { ListContactHealthQueryDto } from './dto/list-contact-health-query.dto';

@Injectable()
export class ContactsRepository {
  constructor(
    @InjectModel(CustomerContact.name)
    private readonly contacts: Model<CustomerContact>,
    @InjectModel(CustomerHealthSnapshot.name)
    private readonly healthSnapshots: Model<CustomerHealthSnapshot>,
  ) {}

  async create(input: Record<string, unknown>) {
    const contact = await this.contacts.create(input);
    return contact.toObject();
  }

  async createMany(inputs: Record<string, unknown>[]) {
    const contacts = await this.contacts.insertMany(inputs, { ordered: false });
    return contacts.map((contact) => contact.toObject());
  }

  findByIds(organizationId: string, ids: string[]) {
    return this.contacts
      .find({ organizationId, _id: { $in: ids } })
      .lean()
      .exec();
  }

  findDuplicatesMany(
    organizationId: string,
    emails: string[],
    phones: string[],
  ) {
    const matches = [
      ...(emails.length ? [{ email: { $in: emails } }] : []),
      ...(phones.length ? [{ phone: { $in: phones } }] : []),
    ];
    if (!matches.length) return Promise.resolve([]);
    return this.contacts
      .find({
        organizationId,
        status: CustomerContactStatus.ACTIVE,
        $or: matches,
      })
      .select('_id email phone')
      .lean()
      .exec();
  }

  async list(organizationId: string, query: ListContactsQueryDto) {
    const escaped = query.search?.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const filter: FilterQuery<CustomerContact> = {
      organizationId,
      status: query.status,
      ...(query.leadStatus === CustomerLeadStatus.NEW
        ? {
            $and: [
              {
                $or: [
                  { leadStatus: CustomerLeadStatus.NEW },
                  { leadStatus: { $exists: false } },
                ],
              },
            ],
          }
        : query.leadStatus
          ? { leadStatus: query.leadStatus }
          : {}),
      ...(escaped
        ? {
            $or: [
              { name: { $regex: escaped, $options: 'i' } },
              { email: { $regex: escaped, $options: 'i' } },
              { phone: { $regex: escaped, $options: 'i' } },
              { company: { $regex: escaped, $options: 'i' } },
              { jobTitle: { $regex: escaped, $options: 'i' } },
              { location: { $regex: escaped, $options: 'i' } },
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

  async healthHistory(
    organizationId: string,
    contactId: string,
    query: ListContactHealthQueryDto,
  ) {
    const filter = { organizationId, contactId };
    const [items, total] = await Promise.all([
      this.healthSnapshots
        .find(filter)
        .sort({ capturedAt: -1, _id: -1 })
        .skip((query.page - 1) * query.limit)
        .limit(query.limit)
        .lean()
        .exec(),
      this.healthSnapshots.countDocuments(filter).exec(),
    ]);
    return { items, total };
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

  findActiveByPhone(organizationId: string, phone: string) {
    return this.contacts
      .findOne({
        organizationId,
        phone,
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
