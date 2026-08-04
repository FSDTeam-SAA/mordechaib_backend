import { Injectable, NotFoundException } from '@nestjs/common';
import { SubscriptionStatus } from '../../common/enums/subscription-status.enum';
import { SubscriptionPlansService } from './subscription-plans.service';
import { SubscriptionsRepository } from './subscriptions.repository';

type ActivateSubscriptionInput = {
  organizationId: string;
  planId: string;
  stripeCustomerId: string;
  stripeSubscriptionId: string;
  status: SubscriptionStatus;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
};

type SyncSubscriptionStatusInput = {
  stripeSubscriptionId: string;
  status: SubscriptionStatus;
  currentPeriodStart?: Date;
  currentPeriodEnd?: Date;
  cancelAtPeriodEnd?: boolean;
};

@Injectable()
export class SubscriptionsService {
  constructor(
    private readonly repository: SubscriptionsRepository,
    private readonly plansService: SubscriptionPlansService,
  ) {}

  async getMine(organizationId: string) {
    const subscription =
      await this.repository.findByOrganizationId(organizationId);
    if (!subscription) {
      throw new NotFoundException(
        'This organization does not have an active subscription yet',
      );
    }
    const plan = await this.plansService.findById(subscription.planId);
    return { subscription, plan };
  }

  // Called by BillingService when Stripe reports checkout.session.completed.
  async activateSubscription(input: ActivateSubscriptionInput) {
    const plan = await this.plansService.findById(input.planId);
    return this.repository.upsertForOrganization({
      organizationId: input.organizationId,
      planId: input.planId,
      status: input.status,
      stripeCustomerId: input.stripeCustomerId,
      stripeSubscriptionId: input.stripeSubscriptionId,
      currentPeriodStart: input.currentPeriodStart,
      currentPeriodEnd: input.currentPeriodEnd,
      cancelAtPeriodEnd: false,
      snapshotLimits: {
        priceUsd: plan.priceUsd,
        aiActionsPerMonth: plan.aiActionsPerMonth,
        crmContactsLimit: plan.crmContactsLimit,
        callMinutesPerMonth: plan.callMinutesPerMonth,
        usersIncluded: plan.usersIncluded,
        aiAgentsIncluded: plan.aiAgentsIncluded,
        extraAiActionPriceUsd: plan.extraAiActionPriceUsd,
        extraCallMinutePriceUsd: plan.extraCallMinutePriceUsd,
      },
    });
  }

  // Called by BillingService for customer.subscription.updated/deleted and
  // invoice.payment_failed — keeps status/period in sync with Stripe.
  syncSubscriptionStatus(input: SyncSubscriptionStatusInput) {
    return this.repository.updateByStripeSubscriptionId(
      input.stripeSubscriptionId,
      {
        status: input.status,
        currentPeriodStart: input.currentPeriodStart,
        currentPeriodEnd: input.currentPeriodEnd,
        cancelAtPeriodEnd: input.cancelAtPeriodEnd,
      },
    );
  }
}