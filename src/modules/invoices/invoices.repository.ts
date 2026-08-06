import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Invoice } from '../../database/schemas/invoice.schema';
import { InvoiceStatus } from '../../common/enums/invoice-status.enum';
import { PlanType } from '../../common/enums/plan-type.enum';

type UpsertInvoiceInput = {
  stripeInvoiceId: string;
  stripeSubscriptionId?: string;
  invoiceNumber?: string;
  organizationId: string;
  organizationName: string;
  planId?: string;
  planType?: PlanType;
  planName?: string;
  amountUsd: number;
  billingInterval?: string;
  status: InvoiceStatus;
  hostedInvoiceUrl?: string;
  invoicePdfUrl?: string;
  periodStart?: Date;
  periodEnd?: Date;
  issuedAt: Date;
};

type ListInvoicesFilter = {
  search?: string;
  planType?: PlanType;
  status?: InvoiceStatus;
  page: number;
  limit: number;
};

@Injectable()
export class InvoicesRepository {
  constructor(
    @InjectModel(Invoice.name) private readonly invoiceModel: Model<Invoice>,
  ) {}

  upsertByStripeInvoiceId(input: UpsertInvoiceInput) {
    return this.invoiceModel
      .findOneAndUpdate(
        { stripeInvoiceId: input.stripeInvoiceId },
        { $set: input },
        { new: true, upsert: true },
      )
      .exec();
  }

  deleteById(id: string) {
    return this.invoiceModel.findByIdAndDelete(id).exec();
  }

  async list(filter: ListInvoicesFilter) {
    const query: Record<string, unknown> = {};
    if (filter.search) {
      query.$or = [
        { organizationName: { $regex: filter.search, $options: 'i' } },
        { invoiceNumber: { $regex: filter.search, $options: 'i' } },
      ];
    }
    if (filter.planType) query.planType = filter.planType;
    if (filter.status) query.status = filter.status;

    const skip = (filter.page - 1) * filter.limit;
    const [items, total] = await Promise.all([
      this.invoiceModel
        .find(query)
        .sort({ issuedAt: -1 })
        .skip(skip)
        .limit(filter.limit)
        .lean()
        .exec(),
      this.invoiceModel.countDocuments(query).exec(),
    ]);

    return { items, total };
  }
}