import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { OrganizationSubscription } from '../../database/schemas/organization-subscription.schema';
import { SubscriptionStatus } from '../../common/enums/subscription-status.enum';

type UpsertSubscriptionInput = {
  organizationId: string;
  planId: string;
  status: SubscriptionStatus;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  currentPeriodStart?: Date;
  currentPeriodEnd?: Date;
  billingInterval?: string;
  cancelAtPeriodEnd?: boolean;
  snapshotLimits?: OrganizationSubscription['snapshotLimits'];
};

type ListForAdminFilter = {
  organizationIds?: string[];
  planId?: string;
  status?: SubscriptionStatus;
  page: number;
  limit: number;
};

@Injectable()
export class SubscriptionsRepository {
  constructor(
    @InjectModel(OrganizationSubscription.name)
    private readonly subscriptionModel: Model<OrganizationSubscription>,
  ) {}

  findByOrganizationId(organizationId: string) {
    return this.subscriptionModel.findOne({ organizationId }).exec();
  }

  findByStripeSubscriptionId(stripeSubscriptionId: string) {
    return this.subscriptionModel.findOne({ stripeSubscriptionId }).exec();
  }

  existsForPlan(planId: string) {
    return this.subscriptionModel
      .exists({
        planId,
        status: {
          $in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIALING],
        },
      })
      .then(Boolean);
  }

  upsertForOrganization(input: UpsertSubscriptionInput) {
    return this.subscriptionModel
      .findOneAndUpdate(
        { organizationId: input.organizationId },
        { $set: input },
        { new: true, upsert: true },
      )
      .exec();
  }

  updateByStripeSubscriptionId(
    stripeSubscriptionId: string,
    input: Partial<UpsertSubscriptionInput>,
  ) {
    return this.subscriptionModel
      .findOneAndUpdate(
        { stripeSubscriptionId },
        { $set: input },
        { new: true },
      )
      .exec();
  }

  async listForAdmin(filter: ListForAdminFilter) {
    const query: Record<string, unknown> = {};
    if (filter.organizationIds) {
      query.organizationId = { $in: filter.organizationIds };
    }
    if (filter.planId) query.planId = filter.planId;
    if (filter.status) query.status = filter.status;

    const skip = (filter.page - 1) * filter.limit;
    const [items, total] = await Promise.all([
      this.subscriptionModel
        .find(query)
        .sort({ updatedAt: -1 })
        .skip(skip)
        .limit(filter.limit)
        .lean()
        .exec(),
      this.subscriptionModel.countDocuments(query).exec(),
    ]);

    return { items, total };
  }
}