import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model } from 'mongoose';
import { StrategicNote } from '../../database/schemas/strategic-note.schema';

@Injectable()
export class StrategicNotesRepository {
  constructor(
    @InjectModel(StrategicNote.name)
    private readonly notes: Model<StrategicNote>,
  ) {}

  async create(input: Record<string, unknown>) {
    const note = await this.notes.create(input);
    return note.toObject();
  }

  async list(
    organizationId: string,
    page: number,
    limit: number,
    activeAt?: Date,
  ) {
    const filter: FilterQuery<StrategicNote> = {
      organizationId,
      deletedAt: { $exists: false },
      ...(activeAt
        ? {
            validFrom: { $lte: activeAt },
            $or: [
              { validUntil: { $exists: false } },
              { validUntil: { $gt: activeAt } },
            ],
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      this.notes
        .find(filter)
        .sort({ validFrom: -1, createdAt: -1, _id: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean()
        .exec(),
      this.notes.countDocuments(filter).exec(),
    ]);
    return { items, total };
  }

  findById(organizationId: string, id: string) {
    return this.notes
      .findOne({ _id: id, organizationId, deletedAt: { $exists: false } })
      .lean()
      .exec();
  }

  update(organizationId: string, id: string, values: Record<string, unknown>) {
    return this.notes
      .findOneAndUpdate(
        { _id: id, organizationId, deletedAt: { $exists: false } },
        { $set: values },
        { new: true, runValidators: true },
      )
      .lean()
      .exec();
  }

  softDelete(organizationId: string, id: string, userId: string) {
    return this.notes
      .findOneAndUpdate(
        { _id: id, organizationId, deletedAt: { $exists: false } },
        { $set: { deletedAt: new Date(), deletedByUserId: userId } },
        { new: true },
      )
      .lean()
      .exec();
  }
}
