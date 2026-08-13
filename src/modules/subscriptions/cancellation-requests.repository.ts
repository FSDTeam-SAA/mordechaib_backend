import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CancellationRequest } from '../../database/schemas/cancellation-request.schema';
import { CancellationReason } from '../../common/enums/cancellation-reason.enum';
import { CancellationRequestStatus } from '../../common/enums/cancellation-request-status.enum';
import { RetentionOfferChoice } from '../../common/enums/retention-offer-choice.enum';

type CreateCancellationRequestInput = {
  organizationId: string;
  subscriptionId: string;
  stripeSubscriptionId: string;
  reason: CancellationReason;
  reasonDetail?: string;
  retentionOfferChoice: RetentionOfferChoice;
  scheduledCancelAt: Date;
};

type ListForAdminFilter = {
  status?: CancellationRequestStatus;
  page: number;
  limit: number;
};

@Injectable()
export class CancellationRequestsRepository {
  constructor(
    @InjectModel(CancellationRequest.name)
    private readonly model: Model<CancellationRequest>,
  ) {}

  create(input: CreateCancellationRequestInput) {
    return this.model.create({
      ...input,
      status: CancellationRequestStatus.SCHEDULED,
    });
  }

  findById(id: string) {
    return this.model.findById(id).exec();
  }

  // The one active (SCHEDULED) request for an org, if any — an org can
  // only have one pending cancellation at a time (enforced in the service).
  findActiveForOrganization(organizationId: string) {
    return this.model
      .findOne({
        organizationId,
        status: CancellationRequestStatus.SCHEDULED,
      })
      .exec();
  }

  markUndone(id: string) {
    return this.model
      .findByIdAndUpdate(
        id,
        { status: CancellationRequestStatus.UNDONE, undoneAt: new Date() },
        { new: true },
      )
      .exec();
  }

  markExecuted(id: string, executedBy: 'CRON' | 'ADMIN') {
    return this.model
      .findByIdAndUpdate(
        id,
        {
          status: CancellationRequestStatus.EXECUTED,
          executedAt: new Date(),
          executedBy,
        },
        { new: true },
      )
      .exec();
  }

  // For the nightly/hourly cron — everything still SCHEDULED whose grace
  // period has elapsed.
  findDueForExecution(asOf: Date) {
    return this.model
      .find({
        status: CancellationRequestStatus.SCHEDULED,
        scheduledCancelAt: { $lte: asOf },
      })
      .exec();
  }

  async listForAdmin(filter: ListForAdminFilter) {
    const query: Record<string, unknown> = {};
    if (filter.status) query.status = filter.status;

    const skip = (filter.page - 1) * filter.limit;
    const [items, total] = await Promise.all([
      this.model
        .find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(filter.limit)
        .lean()
        .exec(),
      this.model.countDocuments(query).exec(),
    ]);

    return { items, total };
  }
}