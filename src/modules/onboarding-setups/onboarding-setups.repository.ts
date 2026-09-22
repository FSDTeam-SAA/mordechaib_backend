import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model, Types, UpdateQuery } from 'mongoose';
import { SetupMeetingStatus } from '../../common/enums/setup-meeting-status.enum';
import { SetupStatus } from '../../common/enums/setup-status.enum';
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

  async deleteById(id: string, organizationId: string) {
    const result = await this.setupModel
      .deleteOne({ _id: id, organizationId })
      .exec();
    return result.deletedCount === 1;
  }

  findAll(
    query: OnboardingSetupQueryDto,
    extraFilters: FilterQuery<OnboardingSetup> = {},
  ) {
    const {
      status,
      setupType,
      assignedAdminId,
      page = 1,
      limit = 20,
    } = query;
    const filter: FilterQuery<OnboardingSetup> = {
      ...extraFilters,
      ...(status ? { status } : {}),
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

  bookMeetingIfPending(
    id: string,
    organizationId: string,
    update: UpdateQuery<OnboardingSetup>,
  ) {
    return this.setupModel
      .findOneAndUpdate(
        {
          _id: id,
          organizationId,
          status: {
            $in: [
              SetupStatus.MEETING_PENDING,
              SetupStatus.PAYMENT_COMPLETED,
              SetupStatus.MEETING_SCHEDULED,
            ],
          },
          'meeting.status': SetupMeetingStatus.PENDING,
        },
        update,
        { new: true, runValidators: true },
      )
      .lean()
      .exec();
  }

  findScheduledMeetingsInRange(
    startsBefore: Date,
    endsAfter: Date,
    excludeSetupId?: string,
  ) {
    const filter: FilterQuery<OnboardingSetup> = {
      'meeting.status': SetupMeetingStatus.SCHEDULED,
      'meeting.startTime': { $lt: startsBefore },
      'meeting.endTime': { $gt: endsAfter },
    };
    if (excludeSetupId && Types.ObjectId.isValid(excludeSetupId)) {
      filter._id = { $ne: new Types.ObjectId(excludeSetupId) };
    }

    return this.setupModel
      .find(filter)
      .select('meeting.startTime meeting.endTime')
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
