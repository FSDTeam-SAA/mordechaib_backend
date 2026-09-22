import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AddonCategory } from '../../common/enums/addon-category.enum';
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
  pausedUntil?: Date | null;
  snapshotLimits?: OrganizationSubscription['snapshotLimits'];
};

type ListForAdminFilter = {
  organizationIds?: string[];
  planId?: string;
  status?: SubscriptionStatus;
  statuses?: SubscriptionStatus[];
  billingInterval?: 'month' | 'year';
  page: number;
  limit: number;
};

export type PlanSubscriptionStats = {
  planId: string;
  activeSubscriberCount: number;
  monthlyRevenueUsd: number;
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

  findById(id: string) {
    return this.subscriptionModel.findById(id).lean().exec();
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

  setPause(organizationId: string, pausedUntil: Date | null) {
    return this.subscriptionModel
      .findOneAndUpdate(
        { organizationId },
        { $set: { pausedUntil } },
        { new: true },
      )
      .exec();
  }

  // Used by BillingService.upgradeSubscription — an optimistic local
  // update right after the Stripe call succeeds, rather than waiting on
  // the customer.subscription.updated webhook (which syncs status/period
  // but has no way to know our internal planId).
  updatePlan(
    organizationId: string,
    planId: string,
    snapshotLimits: OrganizationSubscription['snapshotLimits'],
  ) {
    return this.subscriptionModel
      .findOneAndUpdate(
        { organizationId },
        { $set: { planId, snapshotLimits } },
        { new: true },
      )
      .exec();
  }

  // Upsert an add-on entry (add or replace by product and tier).
  // Pulls any existing entry for the same addonProductId and tierIndex, then pushes the new one.
  async upsertAddon(
    organizationId: string,
    addon: OrganizationSubscription['activeAddons'][number],
  ) {
    await this.subscriptionModel
      .findOneAndUpdate(
        { organizationId },
        {
          $pull: {
            activeAddons: {
              addonProductId: addon.addonProductId,
              tierIndex: addon.tierIndex,
            },
          },
        },
      )
      .exec();
    return this.subscriptionModel
      .findOneAndUpdate(
        { organizationId },
        { $push: { activeAddons: addon } },
        { new: true },
      )
      .exec();
  }

  // Remove an add-on entry by category.
  removeAddon(organizationId: string, category: AddonCategory) {
    return this.subscriptionModel
      .findOneAndUpdate(
        { organizationId },
        { $pull: { activeAddons: { category } } },
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
    else if (filter.statuses) query.status = { $in: filter.statuses };
    if (filter.billingInterval) {
      query.billingInterval = filter.billingInterval;
    }

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

  // Card-level figures use the price captured when an organization
  // subscribed, rather than the plan's current catalog price. This keeps
  // revenue correct after an admin changes a plan price for new customers.
  async getLiveStatsByPlanIds(planIds: string[]): Promise<PlanSubscriptionStats[]> {
    if (planIds.length === 0) return [];

    return this.subscriptionModel.aggregate<PlanSubscriptionStats>([
      {
        $match: {
          planId: { $in: planIds },
          status: {
            $in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIALING],
          },
        },
      },
      {
        $group: {
          _id: '$planId',
          activeSubscriberCount: { $sum: 1 },
          monthlyRevenueUsd: {
            $sum: {
              $cond: [
                { $gt: ['$pausedUntil', new Date()] },
                0,
                { $ifNull: ['$snapshotLimits.priceUsd', 0] },
              ],
            },
          },
        },
      },
      {
        $project: {
          _id: 0,
          planId: '$_id',
          activeSubscriberCount: 1,
          monthlyRevenueUsd: 1,
        },
      },
    ]);
  }
}
