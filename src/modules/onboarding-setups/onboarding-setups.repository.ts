import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model, UpdateQuery } from 'mongoose';
import {
  AdminNote,
  OnboardingSetup,
  StatusHistoryEntry,
} from '../../database/schemas/onboarding-setup.schema';
import { OnboardingSetupQueryDto } from './dto/onboarding-setup-query.dto';

export type OnboardingSetupLean = OnboardingSetup & { _id: unknown };

@Injectable()
export class OnboardingSetupsRepository {
  constructor(
    @InjectModel(OnboardingSetup.name)
    private readonly setupModel: Model<OnboardingSetup>,
  ) {}

  create(
    input: Record<string, unknown> & {
      organizationId: string;
      organizerId: string;
      createdBy: string;
    },
  ) {
    return this.setupModel.create(input);
  }

  findById(id: string, organizationId?: string) {
    const filter: FilterQuery<OnboardingSetup> = { _id: id };
    if (organizationId) filter.organizationId = organizationId;
    return this.setupModel.findOne(filter).lean().exec();
  }

  findActiveByOrganization(organizationId: string) {
    return this.setupModel
      .findOne({ organizationId, status: { $ne: 'CANCELLED' } })
      .sort({ createdAt: -1 })
      .lean()
      .exec();
  }

  findAll(
    query: OnboardingSetupQueryDto,
    extraFilters: FilterQuery<OnboardingSetup> = {},
  ) {
    const {
      status,
      packageType,
      setupType,
      assignedAdminId,
      page = 1,
      limit = 20,
    } = query;
    const filter: FilterQuery<OnboardingSetup> = {
      ...extraFilters,
      ...(status ? { status } : {}),
      ...(packageType ? { packageType } : {}),
      ...(setupType ? { setupType } : {}),
      ...(assignedAdminId ? { assignedAdminId } : {}),
    };

    return Promise.all([
      this.setupModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean()
        .exec(),
      this.setupModel.countDocuments(filter).exec(),
    ]);
  }

  update(
    id: string,
    update: UpdateQuery<OnboardingSetup>,
    organizationId?: string,
  ) {
    const filter: FilterQuery<OnboardingSetup> = { _id: id };
    if (organizationId) filter.organizationId = organizationId;
    return this.setupModel
      .findOneAndUpdate(filter, update, { new: true })
      .lean()
      .exec();
  }

  pushStatusHistory(id: string, entry: StatusHistoryEntry) {
    return this.setupModel
      .findByIdAndUpdate(id, { $push: { statusHistory: entry } }, { new: true })
      .lean()
      .exec();
  }

  pushAdminNote(id: string, note: AdminNote) {
    return this.setupModel
      .findByIdAndUpdate(id, { $push: { adminNotes: note } }, { new: true })
      .lean()
      .exec();
  }
}
