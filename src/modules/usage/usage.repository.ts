import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { UsageRecord } from '../../database/schemas/usage-record.schema';

@Injectable()
export class UsageRepository {
  constructor(
    @InjectModel(UsageRecord.name)
    private readonly usage: Model<UsageRecord>,
  ) {}

  async createEvent(input: {
    organizationId: string;
    provider: string;
    metric: string;
    sourceId: string;
    quantity: number;
    unit: string;
    cost?: number;
    periodStart: Date;
    periodEnd: Date;
    metadata?: Record<string, unknown>;
  }) {
    try {
      const event = await this.usage.create(input);
      return { event: event.toObject(), created: true };
    } catch (error) {
      if (!this.isDuplicateKeyError(error)) throw error;
      const event = await this.usage
        .findOne({
          provider: input.provider,
          metric: input.metric,
          sourceId: input.sourceId,
        })
        .lean()
        .exec();
      return { event, created: false };
    }
  }

  aggregatePeriod(organizationId: string, from: Date, to: Date) {
    return this.usage
      .aggregate<{
        provider: string;
        metric: string;
        unit: string;
        quantity: number;
        costUsd: number;
        events: number;
      }>([
        {
          $match: {
            organizationId,
            periodStart: from,
            periodEnd: to,
          },
        },
        {
          $group: {
            _id: {
              provider: '$provider',
              metric: '$metric',
              unit: '$unit',
            },
            quantity: { $sum: '$quantity' },
            costUsd: { $sum: { $ifNull: ['$cost', 0] } },
            events: { $sum: 1 },
          },
        },
        {
          $project: {
            _id: 0,
            provider: '$_id.provider',
            metric: '$_id.metric',
            unit: '$_id.unit',
            quantity: 1,
            costUsd: 1,
            events: 1,
          },
        },
        { $sort: { provider: 1, metric: 1 } },
      ])
      .exec();
  }

  aggregateBillingStatuses(organizationId: string, from: Date, to: Date) {
    return this.usage
      .aggregate<{
        provider: string;
        metric: string;
        billingStatus: string;
        quantity: number;
        overageQuantity: number;
        costUsd: number;
      }>([
        {
          $match: {
            organizationId,
            periodStart: from,
            periodEnd: to,
          },
        },
        {
          $group: {
            _id: {
              provider: '$provider',
              metric: '$metric',
              billingStatus: '$billingStatus',
            },
            quantity: { $sum: '$quantity' },
            overageQuantity: { $sum: { $ifNull: ['$overageQuantity', 0] } },
            costUsd: { $sum: { $ifNull: ['$cost', 0] } },
          },
        },
        {
          $project: {
            _id: 0,
            provider: '$_id.provider',
            metric: '$_id.metric',
            billingStatus: '$_id.billingStatus',
            quantity: 1,
            overageQuantity: 1,
            costUsd: 1,
          },
        },
      ])
      .exec();
  }

  private isDuplicateKeyError(error: unknown) {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 11000
    );
  }
}
