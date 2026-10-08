import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model } from 'mongoose';
import type {
  CrmRecordsWriteResult,
  NormalizedCrmRecord,
} from '../../common/types/crm-object-sync.interface';
import type { CrmProviderType } from '../../common/types/crm-provider.interface';
import { CrmRecord } from '../../database/schemas/crm-record.schema';
import { ListCrmRecordsQueryDto } from './dto/list-crm-records-query.dto';

@Injectable()
export class CrmRecordsRepository {
  constructor(
    @InjectModel(CrmRecord.name)
    private readonly records: Model<CrmRecord>,
  ) {}

  async upsertMany(
    organizationId: string,
    provider: CrmProviderType,
    items: NormalizedCrmRecord[],
    syncedAt: Date,
  ): Promise<CrmRecordsWriteResult> {
    const uniqueItems = this.uniqueItems(items);
    if (!uniqueItems.length) return this.emptyWriteResult();

    const result = await this.records.bulkWrite(
      uniqueItems.map((item) => ({
        updateOne: {
          filter: {
            organizationId,
            provider,
            objectType: item.objectType,
            externalId: item.externalId,
          },
          update: {
            $set: {
              organizationId,
              provider,
              objectType: item.objectType,
              externalId: item.externalId,
              properties: item.properties,
              associations: item.associations || {},
              archived: item.archived,
              syncedAt,
              ...(item.providerCreatedAt
                ? { providerCreatedAt: item.providerCreatedAt }
                : {}),
              ...(item.providerUpdatedAt
                ? { providerUpdatedAt: item.providerUpdatedAt }
                : {}),
              ...(item.rawPayload ? { rawPayload: item.rawPayload } : {}),
            },
          },
          upsert: true,
        },
      })),
      { ordered: false },
    );

    return {
      processed: uniqueItems.length,
      matched: result.matchedCount,
      modified: result.modifiedCount,
      upserted: result.upsertedCount,
    };
  }

  async list(organizationId: string, query: ListCrmRecordsQueryDto) {
    const filter: FilterQuery<CrmRecord> = {
      organizationId,
      archived: query.archived,
      ...(query.provider ? { provider: query.provider } : {}),
      ...(query.objectType ? { objectType: query.objectType } : {}),
      ...(query.externalId ? { externalId: query.externalId } : {}),
      ...(query.updatedFrom || query.updatedTo
        ? {
            providerUpdatedAt: {
              ...(query.updatedFrom
                ? { $gte: new Date(query.updatedFrom) }
                : {}),
              ...(query.updatedTo ? { $lte: new Date(query.updatedTo) } : {}),
            },
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      this.records
        .find(filter)
        .sort({ providerUpdatedAt: -1, syncedAt: -1, _id: -1 })
        .skip((query.page - 1) * query.limit)
        .limit(query.limit)
        .lean()
        .exec(),
      this.records.countDocuments(filter).exec(),
    ]);
    return { items, total };
  }

  findById(organizationId: string, id: string) {
    return this.records.findOne({ _id: id, organizationId }).lean().exec();
  }

  private emptyWriteResult(): CrmRecordsWriteResult {
    return { processed: 0, matched: 0, modified: 0, upserted: 0 };
  }

  private uniqueItems(items: NormalizedCrmRecord[]) {
    const unique = new Map<string, NormalizedCrmRecord>();
    for (const item of items) {
      unique.set(`${item.objectType}\u0000${item.externalId}`, item);
    }
    return [...unique.values()];
  }
}
