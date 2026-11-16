import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { RevenueAcquisitionCost } from '../../database/schemas/revenue-acquisition-cost.schema';
import { ListRevenueAcquisitionCostsQueryDto } from './dto/list-revenue-acquisition-costs-query.dto';
import { RevenueAcquisitionCostImportRow } from './revenue-acquisition-cost-csv.parser';
import { RevenueAcquisitionChannel } from './revenue-analytics.enums';

export type RevenueAcquisitionCostWrite = {
  period: string;
  channel: RevenueAcquisitionChannel;
  salesCostUsd: number;
  marketingCostUsd: number;
  notes?: string;
};

@Injectable()
export class RevenueAcquisitionCostRepository {
  constructor(
    @InjectModel(RevenueAcquisitionCost.name)
    private readonly model: Model<RevenueAcquisitionCost>,
  ) {}

  create(input: RevenueAcquisitionCostWrite, userId: string) {
    return this.model.create({
      ...input,
      currency: 'USD',
      createdByUserId: userId,
      updatedByUserId: userId,
    });
  }

  findDuplicate(period: string, channel: RevenueAcquisitionChannel) {
    return this.model.findOne({ period, channel }).lean().exec();
  }

  findById(id: string) {
    return this.model.findById(id).lean().exec();
  }

  updateById(
    id: string,
    update: Partial<RevenueAcquisitionCostWrite>,
    userId: string,
  ) {
    return this.model
      .findByIdAndUpdate(
        id,
        { $set: { ...update, updatedByUserId: userId } },
        { new: true, runValidators: true },
      )
      .lean()
      .exec();
  }

  deleteById(id: string) {
    return this.model.findByIdAndDelete(id).lean().exec();
  }

  async list(query: ListRevenueAcquisitionCostsQueryDto) {
    const filter: Record<string, unknown> = {};
    if (query.channel) filter.channel = query.channel;
    if (query.fromPeriod || query.toPeriod) {
      filter.period = {
        ...(query.fromPeriod ? { $gte: query.fromPeriod } : {}),
        ...(query.toPeriod ? { $lte: query.toPeriod } : {}),
      };
    }
    const [items, total] = await Promise.all([
      this.model
        .find(filter)
        .sort({ period: -1, channel: 1 })
        .skip((query.page - 1) * query.limit)
        .limit(query.limit)
        .lean()
        .exec(),
      this.model.countDocuments(filter).exec(),
    ]);
    return { items, total };
  }

  findPeriods(fromPeriod: string, toPeriod: string) {
    return this.model
      .find({ period: { $gte: fromPeriod, $lte: toPeriod } })
      .sort({ period: 1, channel: 1 })
      .lean()
      .exec();
  }

  async import(rows: RevenueAcquisitionCostImportRow[], userId: string) {
    const result = await this.model.bulkWrite(
      rows.map((row) => ({
        updateOne: {
          filter: { period: row.period, channel: row.channel },
          update: {
            $set: {
              ...row,
              currency: 'USD',
              updatedByUserId: userId,
            },
            $setOnInsert: { createdByUserId: userId },
          },
          upsert: true,
        },
      })),
      { ordered: true },
    );
    return {
      processed: rows.length,
      created: result.upsertedCount,
      updated: result.modifiedCount,
      unchanged: rows.length - result.upsertedCount - result.modifiedCount,
    };
  }

  isValidId(id: string) {
    return Types.ObjectId.isValid(id);
  }
}
