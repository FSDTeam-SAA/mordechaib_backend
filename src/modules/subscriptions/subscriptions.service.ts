import { Injectable, NotFoundException } from '@nestjs/common';
import { PlanType } from '../../common/enums/plan-type.enum';
import { SubscriptionStatus } from '../../common/enums/subscription-status.enum';
import { OrganizationsService } from '../organizations/organizations.service';
import { ListSubscriptionsQueryDto } from './dto/list-subscriptions-query.dto';
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
  billingInterval?: string;
};

type SyncSubscriptionStatusInput = {
  stripeSubscriptionId: string;
  status: SubscriptionStatus;
  currentPeriodStart?: Date;
  currentPeriodEnd?: Date;
  billingInterval?: string;
  cancelAtPeriodEnd?: boolean;
};

@Injectable()
export class SubscriptionsService {
  constructor(
    private readonly repository: SubscriptionsRepository,
    private readonly plansService: SubscriptionPlansService,
    private readonly organizationsService: OrganizationsService,
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

  findByStripeSubscriptionId(stripeSubscriptionId: string) {
    return this.repository.findByStripeSubscriptionId(stripeSubscriptionId);
  }

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
      billingInterval: input.billingInterval,
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

  syncSubscriptionStatus(input: SyncSubscriptionStatusInput) {
    return this.repository.updateByStripeSubscriptionId(
      input.stripeSubscriptionId,
      {
        status: input.status,
        currentPeriodStart: input.currentPeriodStart,
        currentPeriodEnd: input.currentPeriodEnd,
        billingInterval: input.billingInterval,
        cancelAtPeriodEnd: input.cancelAtPeriodEnd,
      },
    );
  }

  // Backs the admin "Subscriptions" table: search by org name, filter by
  // plan/status, paginated. Composed from three small queries (orgs,
  // subscriptions, plans) rather than one heavy cross-collection
  // aggregation — simpler to reason about at this page size.
  async listForAdmin(query: ListSubscriptionsQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 9;

    let organizationIds: string[] | undefined;
    if (query.search) {
      organizationIds = await this.organizationsService.searchIdsByName(
        query.search,
      );
      if (organizationIds.length === 0) {
        return { items: [], page, limit, total: 0, totalPages: 0 };
      }
    }

    let planId: string | undefined;
    if (query.planType) {
      const plan = await this.plansService
        .findByPlanType(query.planType)
        .catch(() => null);
      if (!plan) return { items: [], page, limit, total: 0, totalPages: 0 };
      planId = String(plan._id);
    }

    const { items, total } = await this.repository.listForAdmin({
      organizationIds,
      planId,
      status: query.status,
      page,
      limit,
    });

    const orgIds = [...new Set(items.map((item) => item.organizationId))];
    const planIds = [...new Set(items.map((item) => item.planId))];
    const [orgs, plans] = await Promise.all([
      orgIds.length ? this.organizationsService.findByIds(orgIds) : [],
      planIds.length ? this.plansService.findByIds(planIds) : [],
    ]);
    const orgNameById = new Map(orgs.map((org) => [String(org._id), org.name]));
    const planById = new Map(plans.map((plan) => [String(plan._id), plan]));

    return {
      items: items.map((item) => {
        const plan = planById.get(item.planId);
        return {
          organizationId: item.organizationId,
          organizationName:
            orgNameById.get(item.organizationId) ?? 'Unknown organization',
          planId: item.planId,
          planType: plan?.planType ?? (null as PlanType | null),
          planName: plan?.name ?? 'Unknown plan',
          mrrUsd: item.snapshotLimits?.priceUsd ?? 0,
          billingInterval: item.billingInterval ?? null,
          nextRenewal: item.currentPeriodEnd ?? null,
          status: item.status,
        };
      }),
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    };
  }
}