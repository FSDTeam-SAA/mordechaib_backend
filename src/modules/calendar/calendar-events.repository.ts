import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model, Types } from 'mongoose';
import { CalendarEventStatus } from '../../common/enums/calendar-event-status.enum';
import { CalendarProviderType } from '../../common/enums/calendar-provider.enum';
import { ManagedCalendarEvent } from '../../database/schemas/managed-calendar-event.schema';

export type ReserveCalendarEvent = {
  organizationId: string;
  createdByUserId: string;
  idempotencyHash: string;
  provider: CalendarProviderType;
  title: string;
  description?: string;
  startsAt: Date;
  endsAt: Date;
  timezone: string;
  attendees: string[];
  reminderMinutesBeforeStart: number;
};

export type CalendarEventListFilter = {
  provider?: CalendarProviderType;
  status?: CalendarEventStatus;
  from?: Date;
  to?: Date;
};

@Injectable()
export class CalendarEventsRepository {
  constructor(
    @InjectModel(ManagedCalendarEvent.name)
    private readonly model: Model<ManagedCalendarEvent>,
  ) {}

  async reserve(input: ReserveCalendarEvent) {
    const id = new Types.ObjectId();
    try {
      const event = await this.model
        .findOneAndUpdate(
          { idempotencyHash: input.idempotencyHash },
          {
            $setOnInsert: {
              _id: id,
              ...input,
              status: CalendarEventStatus.CREATING,
            },
          },
          { new: true, upsert: true, runValidators: true },
        )
        .lean()
        .exec();
      return { event, created: String(event?._id) === String(id) };
    } catch (error) {
      if (!this.isDuplicateKeyError(error)) throw error;
      const event = await this.model
        .findOne({ idempotencyHash: input.idempotencyHash })
        .lean()
        .exec();
      if (!event) throw error;
      return { event, created: false };
    }
  }

  findById(id: string, organizationId: string) {
    return this.model.findOne({ _id: id, organizationId }).lean().exec();
  }

  update(
    id: string,
    organizationId: string,
    input: Partial<ManagedCalendarEvent>,
  ) {
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
      .lean()
      .exec();
  }

  async list(
    organizationId: string,
    page: number,
    limit: number,
    filter: CalendarEventListFilter,
  ) {
    const query: FilterQuery<ManagedCalendarEvent> = {
      organizationId,
      ...(filter.provider ? { provider: filter.provider } : {}),
      ...(filter.status ? { status: filter.status } : {}),
      ...(filter.from || filter.to
        ? {
            startsAt: {
              ...(filter.from ? { $gte: filter.from } : {}),
              ...(filter.to ? { $lte: filter.to } : {}),
            },
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      this.model
        .find(query)
        .sort({ startsAt: 1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean()
        .exec(),
      this.model.countDocuments(query).exec(),
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
