import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { UsageBillingPeriod } from '../../database/schemas/usage-billing-period.schema';

export type UsageBillingMetricSnapshot = {
  organizationId: string;
  metric: string;
  unit: string;
  periodStart: Date;
  periodEnd: Date;
  measuredQuantity: number;
  includedQuantity: number;
  billableQuantity: number;
  rateUsd: number;
  amountUsd: number;
  billedAmountUsd: number;
  stripeInvoiceItemIds: string[];
  status: 'NOT_REQUIRED' | 'PENDING' | 'BILLED' | 'FAILED';
  stripeInvoiceId?: string;
  billingError?: string;
  reconciledAt?: Date;
};

@Injectable()
export class UsageBillingRepository {
  constructor(
    @InjectModel(UsageBillingPeriod.name)
    private readonly periods: Model<UsageBillingPeriod>,
  ) {}

  findPeriod(organizationId: string, periodStart: Date, periodEnd: Date) {
    return this.periods
      .find({ organizationId, periodStart, periodEnd })
      .sort({ metric: 1 })
      .lean()
      .exec();
  }

  findMetric(
    organizationId: string,
    metric: string,
    periodStart: Date,
    periodEnd: Date,
  ) {
    return this.periods
      .findOne({ organizationId, metric, periodStart, periodEnd })
      .lean()
      .exec();
  }

  upsert(snapshot: UsageBillingMetricSnapshot) {
    return this.periods
      .findOneAndUpdate(
        {
          organizationId: snapshot.organizationId,
          metric: snapshot.metric,
          periodStart: snapshot.periodStart,
          periodEnd: snapshot.periodEnd,
        },
        { $set: snapshot },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      )
      .lean()
      .exec();
  }

  attachInvoice(
    organizationId: string,
    periodStart: Date,
    periodEnd: Date,
    stripeInvoiceId: string,
  ) {
    return this.periods
      .updateMany(
        { organizationId, periodStart, periodEnd },
        { $set: { stripeInvoiceId } },
      )
      .exec();
  }
}
