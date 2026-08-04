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
  cancelAtPeriodEnd?: boolean;
  snapshotLimits?: OrganizationSubscription['snapshotLimits'];
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

  // One subscription document per organization: create on first checkout,
  // otherwise update in place as Stripe webhook events arrive.
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
}
