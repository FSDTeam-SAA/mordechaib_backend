import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CallUsagePeriod } from '../../database/schemas/call-usage-period.schema';
import { UsageRecord } from '../../database/schemas/usage-record.schema';

@Injectable()
export class TwilioUsageRepository {
  constructor(
    @InjectModel(UsageRecord.name)
    private readonly usageModel: Model<UsageRecord>,
    @InjectModel(CallUsagePeriod.name)
    private readonly periodModel: Model<CallUsagePeriod>,
  ) {}

  async createCallEvent(input: {
    organizationId: string;
    callSid: string;
    durationSeconds: number;
    periodStart: Date;
    periodEnd: Date;
  }) {
    try {
      return await this.usageModel.create({
        organizationId: input.organizationId,
        provider: 'TWILIO',
        metric: 'CALL_SECONDS',
        sourceId: input.callSid,
        quantity: input.durationSeconds,
        unit: 'SECOND',
        periodStart: input.periodStart,
        periodEnd: input.periodEnd,
      });
    } catch (error) {
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === 11000
      ) {
        return null;
      }
      throw error;
    }
  }

  incrementPeriod(input: {
    organizationId: string;
    periodStart: Date;
    periodEnd: Date;
    durationSeconds: number;
  }) {
    return this.periodModel
      .findOneAndUpdate(
        {
          organizationId: input.organizationId,
          periodStart: input.periodStart,
          periodEnd: input.periodEnd,
        },
        {
          $setOnInsert: {
            organizationId: input.organizationId,
            periodStart: input.periodStart,
            periodEnd: input.periodEnd,
          },
          $inc: { totalSeconds: input.durationSeconds },
        },
        { new: true, upsert: true },
      )
      .lean()
      .exec();
  }

  updateEventBilling(
    callSid: string,
    input: {
      includedQuantity: number;
      overageQuantity: number;
      cost: number;
      billingStatus: 'NOT_REQUIRED' | 'PENDING' | 'BILLED' | 'FAILED';
      stripeInvoiceItemId?: string;
      billingError?: string;
    },
  ) {
    return this.usageModel
      .findOneAndUpdate(
        { provider: 'TWILIO', metric: 'CALL_SECONDS', sourceId: callSid },
        {
          $set: input,
          ...(input.billingError === undefined
            ? { $unset: { billingError: 1 } }
            : {}),
        },
        { new: true },
      )
      .lean()
      .exec();
  }

  findEvent(callSid: string) {
    return this.usageModel
      .findOne({
        provider: 'TWILIO',
        metric: 'CALL_SECONDS',
        sourceId: callSid,
      })
      .lean()
      .exec();
  }

  findCurrentPeriod(organizationId: string, at: Date) {
    return this.periodModel
      .findOne({
        organizationId,
        periodStart: { $lte: at },
        periodEnd: { $gt: at },
      })
      .lean()
      .exec();
  }

  claimAlert(
    organizationId: string,
    periodStart: Date,
    periodEnd: Date,
    field:
      | 'includedUsageAlertSentAt'
      | 'unusualUsageAlertSentAt'
      | 'spendingAlertSentAt',
  ) {
    return this.periodModel
      .findOneAndUpdate(
        {
          organizationId,
          periodStart,
          periodEnd,
          [field]: { $exists: false },
        },
        { $set: { [field]: new Date() } },
        { new: true },
      )
      .lean()
      .exec();
  }
}
