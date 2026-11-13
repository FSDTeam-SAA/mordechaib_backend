import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CustomerNote } from '../../database/schemas/customer-note.schema';
import { ListContactContentQueryDto } from './dto/list-contact-content-query.dto';

@Injectable()
export class ContactNotesRepository {
  constructor(
    @InjectModel(CustomerNote.name)
    private readonly notes: Model<CustomerNote>,
  ) {}

  async create(input: Record<string, unknown>) {
    const note = await this.notes.create(input);
    return note.toObject() as unknown as Record<string, unknown>;
  }

  async list(
    organizationId: string,
    contactId: string,
    query: ListContactContentQueryDto,
  ) {
    const filter = {
      organizationId,
      contactId,
      deletedAt: { $exists: false },
    };
    const [items, total] = await Promise.all([
      this.notes
        .find(filter)
        .sort({ createdAt: -1, _id: -1 })
        .skip((query.page - 1) * query.limit)
        .limit(query.limit)
        .lean()
        .exec(),
      this.notes.countDocuments(filter).exec(),
    ]);
    return { items, total };
  }

  update(
    organizationId: string,
    contactId: string,
    noteId: string,
    userId: string,
    content: string,
    expectedRevision: number,
  ) {
    return this.notes
      .findOneAndUpdate(
        {
          _id: noteId,
          organizationId,
          contactId,
          revision: expectedRevision,
          deletedAt: { $exists: false },
        },
        {
          $set: { content, updatedByUserId: userId },
          $inc: { revision: 1 },
        },
        { new: true, runValidators: true },
      )
      .lean()
      .exec();
  }

  find(organizationId: string, contactId: string, noteId: string) {
    return this.notes
      .findOne({
        _id: noteId,
        organizationId,
        contactId,
        deletedAt: { $exists: false },
      })
      .lean()
      .exec();
  }

  archive(
    organizationId: string,
    contactId: string,
    noteId: string,
    userId: string,
  ) {
    return this.notes
      .findOneAndUpdate(
        {
          _id: noteId,
          organizationId,
          contactId,
          deletedAt: { $exists: false },
        },
        { $set: { deletedAt: new Date(), deletedByUserId: userId } },
        { new: true },
      )
      .lean()
      .exec();
  }
}
