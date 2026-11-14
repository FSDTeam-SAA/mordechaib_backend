import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model, Types } from 'mongoose';
import {
  BusinessMemoryKind,
  BusinessMemoryStatus,
} from '../../common/enums/business-memory.enum';
import { BusinessMemory } from '../../database/schemas/business-memory.schema';

export type BusinessMemoryRecord = BusinessMemory & {
  _id: Types.ObjectId;
  createdAt?: Date;
  updatedAt?: Date;
};

export type ListBusinessMemoriesFilter = {
  status?: BusinessMemoryStatus;
  kind?: BusinessMemoryKind;
  contactId?: string;
  search?: string;
};

@Injectable()
export class BusinessMemoryRepository {
  constructor(
    @InjectModel(BusinessMemory.name)
    private readonly memories: Model<BusinessMemory>,
  ) {}

  async create(input: Partial<BusinessMemory>) {
    const memory = await this.memories.create(input);
    return memory.toObject() as BusinessMemoryRecord;
  }

  /**
   * Inserts every memory whose fingerprint is new for the organization; a fact
   * that was already proposed - even one the owner rejected - is skipped.
   */
  async insertNew(organizationId: string, inputs: Partial<BusinessMemory>[]) {
    if (!inputs.length) return 0;
    const existing = await this.memories
      .find(
        {
          organizationId,
          fingerprint: { $in: inputs.map((input) => input.fingerprint) },
        },
        { fingerprint: 1 },
      )
      .lean<{ fingerprint: string }[]>();
    const known = new Set(existing.map((item) => item.fingerprint));
    const fresh = inputs.filter((input) => !known.has(input.fingerprint!));
    if (!fresh.length) return 0;
    try {
      const created = await this.memories.insertMany(fresh, { ordered: false });
      return created.length;
    } catch (error) {
      // A concurrent duplicate hit the unique index: the others were inserted.
      const inserted = (error as { insertedDocs?: unknown[] }).insertedDocs;
      if ((error as { code?: number }).code === 11000 || inserted) {
        return inserted?.length ?? 0;
      }
      throw error;
    }
  }

  async list(
    organizationId: string,
    filter: ListBusinessMemoriesFilter,
    page: number,
    limit: number,
  ) {
    const query: FilterQuery<BusinessMemory> = {
      organizationId,
      ...(filter.status
        ? { status: filter.status }
        : { status: { $ne: BusinessMemoryStatus.ARCHIVED } }),
      ...(filter.kind ? { kind: filter.kind } : {}),
      ...(filter.contactId ? { contactIds: filter.contactId } : {}),
      ...(filter.search ? { $text: { $search: filter.search } } : {}),
    };
    const [items, total] = await Promise.all([
      this.memories
        .find(query)
        .sort({ updatedAt: -1, _id: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean<BusinessMemoryRecord[]>(),
      this.memories.countDocuments(query),
    ]);
    return { items, total };
  }

  findById(organizationId: string, id: string) {
    return this.memories
      .findOne({ _id: id, organizationId })
      .lean<BusinessMemoryRecord>();
  }

  update(
    organizationId: string,
    id: string,
    values: Partial<BusinessMemory>,
    fromStatuses?: BusinessMemoryStatus[],
  ) {
    return this.memories
      .findOneAndUpdate(
        {
          _id: id,
          organizationId,
          ...(fromStatuses ? { status: { $in: fromStatuses } } : {}),
        },
        { $set: values },
        { new: true },
      )
      .lean<BusinessMemoryRecord>();
  }

  /** ACTIVE memories about any of `contactIds`, most recent first. */
  activeForContacts(
    organizationId: string,
    contactIds: string[],
    limit: number,
  ) {
    if (!contactIds.length) return Promise.resolve([]);
    return this.memories
      .find({
        organizationId,
        status: BusinessMemoryStatus.ACTIVE,
        contactIds: { $in: contactIds },
      })
      .sort({ updatedAt: -1 })
      .limit(limit)
      .lean<BusinessMemoryRecord[]>();
  }

  /** ACTIVE memories matching `search`, best match first. */
  activeMatching(organizationId: string, search: string, limit: number) {
    return this.memories
      .find(
        {
          organizationId,
          status: BusinessMemoryStatus.ACTIVE,
          $text: { $search: search },
        },
        { score: { $meta: 'textScore' } },
      )
      .sort({ score: { $meta: 'textScore' } })
      .limit(limit)
      .lean<BusinessMemoryRecord[]>();
  }

  /** The newest ACTIVE memories of the given kinds (company-wide context). */
  activeOfKinds(
    organizationId: string,
    kinds: BusinessMemoryKind[],
    limit: number,
  ) {
    return this.memories
      .find({
        organizationId,
        status: BusinessMemoryStatus.ACTIVE,
        kind: { $in: kinds },
      })
      .sort({ updatedAt: -1 })
      .limit(limit)
      .lean<BusinessMemoryRecord[]>();
  }
}
