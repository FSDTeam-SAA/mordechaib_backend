import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  CrmProviderType,
  NormalizedCrmDeal,
} from '../../common/types/crm-provider.interface';
import {
  CrmDeal,
  CrmDealStageCategory,
} from '../../database/schemas/crm-deal.schema';

@Injectable()
export class CrmDealsRepository {
  constructor(
    @InjectModel(CrmDeal.name) private readonly deals: Model<CrmDeal>,
  ) {}

  async upsert(
    organizationId: string,
    provider: CrmProviderType,
    deal: NormalizedCrmDeal,
    syncedAt: Date,
    updatedLocallyAt?: Date,
  ) {
    return this.deals
      .findOneAndUpdate(
        { organizationId, provider, externalId: deal.externalId },
        {
          $set: {
            organizationId,
            provider,
            externalId: deal.externalId,
            name: deal.name,
            amount: deal.amount,
            currency: deal.currency,
            providerStage: deal.providerStage,
            stageCategory: deal.stageCategory as CrmDealStageCategory,
            closeDate: deal.closeDate,
            ownerId: deal.ownerId,
            ownerName: deal.ownerName,
            archived: deal.archived,
            providerUpdatedAt: deal.providerUpdatedAt,
            syncedAt,
            rawPayload: deal.rawPayload,
            ...(updatedLocallyAt ? { updatedLocallyAt } : {}),
          },
        },
        { upsert: true, new: true, runValidators: true },
      )
      .lean()
      .exec();
  }

  async upsertMany(
    organizationId: string,
    provider: CrmProviderType,
    items: NormalizedCrmDeal[],
    syncedAt: Date,
  ) {
    if (!items.length) return 0;
    const result = await this.deals.bulkWrite(
      items.map((deal) => ({
        updateOne: {
          filter: { organizationId, provider, externalId: deal.externalId },
          update: {
            $set: {
              organizationId,
              provider,
              externalId: deal.externalId,
              name: deal.name,
              amount: deal.amount,
              currency: deal.currency,
              providerStage: deal.providerStage,
              stageCategory: deal.stageCategory as CrmDealStageCategory,
              closeDate: deal.closeDate,
              ownerId: deal.ownerId,
              ownerName: deal.ownerName,
              archived: deal.archived,
              providerUpdatedAt: deal.providerUpdatedAt,
              syncedAt,
              rawPayload: deal.rawPayload,
            },
          },
          upsert: true,
        },
      })),
      { ordered: false },
    );
    return result.upsertedCount + result.modifiedCount + result.matchedCount;
  }

  aggregateRevenue(input: {
    organizationId: string;
    provider?: CrmProviderType;
    from?: Date;
    to?: Date;
    groupBy: 'stage' | 'month';
  }) {
    const match = {
      organizationId: input.organizationId,
      archived: false,
      ...(input.provider ? { provider: input.provider } : {}),
      ...(input.from || input.to
        ? {
            closeDate: {
              ...(input.from ? { $gte: input.from } : {}),
              ...(input.to ? { $lte: input.to } : {}),
            },
          }
        : {}),
    };
    const groupId =
      input.groupBy === 'stage'
        ? { currency: '$currency', stage: '$stageCategory' }
        : {
            currency: '$currency',
            month: {
              $dateToString: { format: '%Y-%m', date: '$closeDate' },
            },
          };
    return this.deals
      .aggregate<{
        _id: { currency: string; stage?: string; month?: string };
        totalAmount: number;
        dealCount: number;
      }>([
        { $match: match },
        {
          $group: {
            _id: groupId,
            totalAmount: { $sum: '$amount' },
            dealCount: { $sum: 1 },
          },
        },
        { $sort: { '_id.currency': 1, '_id.month': 1, '_id.stage': 1 } },
      ])
      .exec();
  }
}
