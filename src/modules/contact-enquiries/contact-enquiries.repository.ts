import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model } from 'mongoose';
import { ContactEnquiryStatus } from '../../common/enums/contact-enquiry-status.enum';
import { ContactEnquiry } from '../../database/schemas/contact-enquiry.schema';
import { ListContactEnquiriesQueryDto } from './dto/list-contact-enquiries-query.dto';

@Injectable()
export class ContactEnquiriesRepository {
  constructor(
    @InjectModel(ContactEnquiry.name)
    private readonly enquiries: Model<ContactEnquiry>,
  ) {}

  async create(input: Record<string, unknown>) {
    const enquiry = await this.enquiries.create(input);
    return enquiry.toObject();
  }

  findByClientRequestId(clientRequestId: string) {
    return this.enquiries
      .findOne({ clientRequestId })
      .select('+clientRequestId +requestHash')
      .lean()
      .exec();
  }

  async list(query: ListContactEnquiriesQueryDto) {
    const escaped = query.search?.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const filter: FilterQuery<ContactEnquiry> = {
      deletedAt: { $exists: false },
      ...(query.status ? { status: query.status } : {}),
      ...(query.createdFrom || query.createdTo
        ? {
            createdAt: {
              ...(query.createdFrom ? { $gte: new Date(query.createdFrom) } : {}),
              ...(query.createdTo ? { $lte: new Date(query.createdTo) } : {}),
            },
          }
        : {}),
      ...(escaped
        ? {
            $or: [
              { referenceId: { $regex: escaped, $options: 'i' } },
              { fullName: { $regex: escaped, $options: 'i' } },
              { email: { $regex: escaped, $options: 'i' } },
              { company: { $regex: escaped, $options: 'i' } },
            ],
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      this.enquiries
        .find(filter)
        .sort({ createdAt: -1, _id: -1 })
        .skip((query.page - 1) * query.limit)
        .limit(query.limit)
        .lean()
        .exec(),
      this.enquiries.countDocuments(filter).exec(),
    ]);
    return { items, total };
  }

  findById(id: string) {
    return this.enquiries
      .findOne({ _id: id, deletedAt: { $exists: false } })
      .lean()
      .exec();
  }

  update(
    id: string,
    expectedRevision: number,
    values: Record<string, unknown>,
    adminUserId: string,
  ) {
    const status = values.status as ContactEnquiryStatus | undefined;
    return this.enquiries
      .findOneAndUpdate(
        {
          _id: id,
          revision: expectedRevision,
          deletedAt: { $exists: false },
        },
        {
          $set: {
            ...values,
            ...(status
              ? {
                  statusChangedAt: new Date(),
                  statusChangedByUserId: adminUserId,
                }
              : {}),
          },
          $inc: { revision: 1 },
        },
        { new: true, runValidators: true },
      )
      .lean()
      .exec();
  }

  softDelete(
    id: string,
    expectedRevision: number,
    adminUserId: string,
    deletedAt: Date,
  ) {
    return this.enquiries
      .findOneAndUpdate(
        {
          _id: id,
          revision: expectedRevision,
          deletedAt: { $exists: false },
        },
        {
          $set: { deletedAt, deletedByUserId: adminUserId },
          $inc: { revision: 1 },
        },
        { new: true },
      )
      .lean()
      .exec();
  }
}
