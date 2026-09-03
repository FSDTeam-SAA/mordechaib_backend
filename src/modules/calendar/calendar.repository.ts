import { ConflictException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CalendarProviderType } from '../../common/enums/calendar-provider.enum';
import {
  Integration,
  IntegrationProvider,
} from '../../database/schemas/integration.schema';

const CALENDAR_PROVIDERS = [
  IntegrationProvider.GOOGLE_CALENDAR,
  IntegrationProvider.OUTLOOK_CALENDAR,
];

@Injectable()
export class CalendarRepository {
  constructor(
    @InjectModel(Integration.name)
    private readonly integrationModel: Model<Integration>,
  ) {}

  find(organizationId: string, provider: CalendarProviderType) {
    return this.integrationModel
      .findOne({ organizationId, provider })
      .select('+accessToken +refreshToken')
      .lean()
      .exec();
  }

  findConnected(organizationId: string, provider: CalendarProviderType) {
    return this.integrationModel
      .findOne({ organizationId, provider, status: 'CONNECTED' })
      .select('+accessToken +refreshToken')
      .lean()
      .exec();
  }

  list(organizationId: string) {
    return this.integrationModel
      .find({ organizationId, provider: { $in: CALENDAR_PROVIDERS } })
      .sort({ provider: 1 })
      .lean()
      .exec();
  }

  async findDefaultConnected(organizationId: string) {
    const selected = await this.integrationModel
      .findOne({
        organizationId,
        provider: { $in: CALENDAR_PROVIDERS },
        status: 'CONNECTED',
        isDefaultCalendar: true,
      })
      .select('+accessToken +refreshToken')
      .lean()
      .exec();
    if (selected) return selected;

    return this.integrationModel
      .findOne({
        organizationId,
        provider: { $in: CALENDAR_PROVIDERS },
        status: 'CONNECTED',
      })
      .sort({ createdAt: 1 })
      .select('+accessToken +refreshToken')
      .lean()
      .exec();
  }

  upsert(
    organizationId: string,
    provider: CalendarProviderType,
    input: Partial<Integration>,
  ) {
    return this.integrationModel
      .findOneAndUpdate(
        { organizationId, provider },
        { $set: { ...input, organizationId, provider } },
        { new: true, upsert: true, runValidators: true },
      )
      .select('+accessToken +refreshToken')
      .lean()
      .exec();
  }

  async ensureDefault(organizationId: string) {
    const existing = await this.integrationModel.exists({
      organizationId,
      provider: { $in: CALENDAR_PROVIDERS },
      status: 'CONNECTED',
      isDefaultCalendar: true,
    });
    if (existing) return;
    const candidate = await this.integrationModel
      .findOne({
        organizationId,
        provider: { $in: CALENDAR_PROVIDERS },
        status: 'CONNECTED',
      })
      .sort({ createdAt: 1 })
      .lean()
      .exec();
    if (!candidate) return;
    try {
      await this.integrationModel.updateOne(
        { _id: candidate._id, status: 'CONNECTED' },
        { $set: { isDefaultCalendar: true } },
      );
    } catch (error) {
      if (!this.isDuplicateKeyError(error)) throw error;
      const winner = await this.integrationModel.exists({
        organizationId,
        provider: { $in: CALENDAR_PROVIDERS },
        status: 'CONNECTED',
        isDefaultCalendar: true,
      });
      if (!winner) throw error;
    }
  }

  async setDefault(organizationId: string, provider: CalendarProviderType) {
    const target = await this.integrationModel
      .findOne({ organizationId, provider, status: 'CONNECTED' })
      .lean()
      .exec();
    if (!target) {
      throw new ConflictException(
        'The selected calendar must be connected before it can be the default',
      );
    }

    const previous = await this.integrationModel
      .findOne({
        organizationId,
        provider: { $in: CALENDAR_PROVIDERS },
        isDefaultCalendar: true,
      })
      .lean()
      .exec();
    if (String(previous?.provider) === provider) return target;

    await this.integrationModel.updateMany(
      {
        organizationId,
        provider: { $in: CALENDAR_PROVIDERS },
        isDefaultCalendar: true,
      },
      { $set: { isDefaultCalendar: false } },
    );
    try {
      return await this.integrationModel
        .findOneAndUpdate(
          { organizationId, provider, status: 'CONNECTED' },
          { $set: { isDefaultCalendar: true } },
          { new: true, runValidators: true },
        )
        .lean()
        .exec();
    } catch (error) {
      if (previous) {
        await this.integrationModel
          .updateOne(
            { _id: previous._id, status: 'CONNECTED' },
            { $set: { isDefaultCalendar: true } },
          )
          .catch(() => undefined);
      }
      throw error;
    }
  }

  async disconnect(organizationId: string, provider: CalendarProviderType) {
    const disconnected = await this.integrationModel
      .findOneAndUpdate(
        { organizationId, provider },
        {
          $set: { status: 'DISCONNECTED', isDefaultCalendar: false },
          $unset: { accessToken: 1, refreshToken: 1, expiresAt: 1 },
        },
        { new: true },
      )
      .lean()
      .exec();
    const next = await this.integrationModel
      .findOne({
        organizationId,
        provider: { $in: CALENDAR_PROVIDERS },
        status: 'CONNECTED',
      })
      .sort({ createdAt: 1 })
      .lean()
      .exec();
    if (next) {
      await this.ensureDefault(organizationId);
    }
    return disconnected;
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
