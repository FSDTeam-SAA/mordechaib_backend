import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model, Types } from 'mongoose';
import { MeetingPlatform } from '../../common/enums/meeting-platform.enum';
import { PlatformMeetingStatus } from '../../common/enums/platform-meeting-status.enum';
import { PlatformMeeting } from '../../database/schemas/platform-meeting.schema';

export type ReservePlatformMeeting = {
  platform: MeetingPlatform;
  organizationId: string;
  createdByUserId: string;
  idempotencyHash: string;
  title: string;
  agenda?: string;
  startsAt: Date;
  endsAt: Date;
  durationMinutes: number;
  timezone: string;
  invitees: string[];
  botRequested: boolean;
  metadata?: Record<string, unknown>;
};

@Injectable()
export class PlatformMeetingsRepository {
  constructor(
    @InjectModel(PlatformMeeting.name)
    private readonly model: Model<PlatformMeeting>,
  ) {}

  async reserve(input: ReservePlatformMeeting) {
    const id = new Types.ObjectId();
    try {
      const meeting = await this.model
        .findOneAndUpdate(
          { idempotencyHash: input.idempotencyHash },
          {
            $setOnInsert: {
              _id: id,
              ...input,
              status: PlatformMeetingStatus.CREATING,
            },
          },
          { new: true, upsert: true, runValidators: true },
        )
        .select('+joinUrlEncrypted +startUrlEncrypted')
        .lean()
        .exec();
      return { meeting, created: String(meeting?._id) === String(id) };
    } catch (error) {
      if (!this.isDuplicateKeyError(error)) throw error;
      const meeting = await this.findInternalByHash(input.idempotencyHash);
      if (!meeting) throw error;
      return { meeting, created: false };
    }
  }

  findInternalByHash(idempotencyHash: string) {
    return this.model
      .findOne({ idempotencyHash })
      .select('+idempotencyHash +joinUrlEncrypted +startUrlEncrypted')
      .lean()
      .exec();
  }

  findInternalById(id: string, organizationId: string) {
    return this.model
      .findOne({ _id: id, organizationId })
      .select('+joinUrlEncrypted +startUrlEncrypted')
      .lean()
      .exec();
  }

  update(id: string, organizationId: string, input: Partial<PlatformMeeting>) {
    const setValues: Record<string, unknown> = {};
    const unsetValues: Record<string, 1> = {};
    for (const [key, value] of Object.entries(input)) {
      if (value === undefined) unsetValues[key] = 1;
      else setValues[key] = value;
    }
    return this.model
      .findOneAndUpdate(
        { _id: id, organizationId },
        {
          ...(Object.keys(setValues).length ? { $set: setValues } : {}),
          ...(Object.keys(unsetValues).length ? { $unset: unsetValues } : {}),
        },
        { new: true, runValidators: true },
      )
      .select('+joinUrlEncrypted +startUrlEncrypted')
      .lean()
      .exec();
  }

  async list(
    organizationId: string,
    page: number,
    limit: number,
    platform?: MeetingPlatform,
    status?: PlatformMeetingStatus,
  ) {
    const filter: FilterQuery<PlatformMeeting> = {
      organizationId,
      ...(platform ? { platform } : {}),
      ...(status ? { status } : {}),
    };
    const [items, total] = await Promise.all([
      this.model
        .find(filter)
        .select('+joinUrlEncrypted +startUrlEncrypted')
        .sort({ startsAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean()
        .exec(),
      this.model.countDocuments(filter).exec(),
    ]);
    return { items, total, page, limit, pages: Math.ceil(total / limit) };
  }

  private isDuplicateKeyError(error: unknown) {
    return (
      !!error &&
      typeof error === 'object' &&
      'code' in error &&
      error.code === 11000
    );
  }
}
