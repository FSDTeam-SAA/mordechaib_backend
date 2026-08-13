import { Injectable, NotFoundException } from '@nestjs/common';
import { PackageType } from '../../common/enums/package-type.enum';
import { PlanType } from '../../common/enums/plan-type.enum';
import { SubscriptionStatus } from '../../common/enums/subscription-status.enum';
import { OrganizationsService } from '../organizations/organizations.service';
import { PackageInquiriesService } from '../package-inquiries/package-inquiries.service';
import { DowngradeRequestDto } from './dto/downgrade-request.dto';
import { ListSubscriptionsQueryDto } from './dto/list-subscriptions-query.dto';
import { SpecialistRequestDto } from './dto/specialist-request.dto';
import { SubscriptionPlan } from '../../database/schemas/subscription-plan.schema';
import { SubscriptionPlansService } from './subscription-plans.service';
import { SubscriptionsRepository } from './subscriptions.repository';

type Requester = { fullName: string; email: string };

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
  pausedUntil?: Date | null;
};

@Injectable()
export class SubscriptionsService {
  constructor(
    private readonly repository: SubscriptionsRepository,
    private readonly plansService: SubscriptionPlansService,
    private readonly organizationsService: OrganizationsService,
    private readonly packageInquiriesService: PackageInquiriesService,
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
      billingInterval: input.billingInterval,
      cancelAtPeriodEnd: false,
      snapshotLimits: this.buildSnapshot(plan),
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
        billingInterval: input.billingInterval,
        cancelAtPeriodEnd: input.cancelAtPeriodEnd,
        pausedUntil: input.pausedUntil,
      },
    );
  }

  // Screen 3 — called by BillingService.pauseSubscription/resumeSubscription
  // after the Stripe call succeeds.
  setPause(organizationId: string, pausedUntil: Date | null) {
    return this.repository.setPause(organizationId, pausedUntil);
  }

  // Called by BillingService.upgradeSubscription right after Stripe
  // confirms the price swap — an optimistic local update rather than
  // waiting on the webhook, which has no way to know our internal planId.
  updatePlanAfterUpgrade(organizationId: string, plan: SubscriptionPlan) {
    return this.repository.updatePlan(
      organizationId,
      String((plan as unknown as { _id: unknown })._id),
      this.buildSnapshot(plan),
    );
  }

  private buildSnapshot(plan: SubscriptionPlan) {
    return {
      priceUsd: plan.priceUsd,
      aiActionsPerMonth: plan.aiActionsPerMonth,
      crmContactsLimit: plan.crmContactsLimit,
      callMinutesPerMonth: plan.callMinutesPerMonth,
      usersIncluded: plan.usersIncluded,
      aiAgentsIncluded: plan.aiAgentsIncluded,
      extraAiActionPriceUsd: plan.extraAiActionPriceUsd,
      extraCallMinutePriceUsd: plan.extraCallMinutePriceUsd,
    };
  }

  // Screen 4 — downgrade is never self-service. This just files a
  // sales-team lead using the requester's own account details.
  async requestDowngrade(
    organizationId: string,
    requester: Requester,
    dto: DowngradeRequestDto,
  ) {
    const organization =
      await this.organizationsService.findCurrent(organizationId);

    await this.packageInquiriesService.create({
      packageType: PackageType.DOWNGRADE_REQUEST,
      organizationId,
      fullName: requester.fullName,
      email: requester.email,
      message: [
        `Organization "${organization.name}" requested a downgrade to "${dto.requestedPlanName}".`,
        dto.note ? `Note: ${dto.note}` : undefined,
      ]
        .filter(Boolean)
        .join(' '),
      acceptContactConsent: true,
    });

    return { message: 'Our sales team will reach out shortly' };
  }

  // Screen 5 — "Talk to a Specialist".
  async requestSpecialistCall(
    organizationId: string,
    requester: Requester,
    dto: SpecialistRequestDto,
  ) {
    const organization =
      await this.organizationsService.findCurrent(organizationId);

    await this.packageInquiriesService.create({
      packageType: PackageType.SPECIALIST_CALL_REQUEST,
      organizationId,
      fullName: requester.fullName,
      email: requester.email,
      message: [
        `Organization "${organization.name}" requested a 15-minute specialist call.`,
        dto.note ? `Note: ${dto.note}` : undefined,
      ]
        .filter(Boolean)
        .join(' '),
      acceptContactConsent: true,
    });

    return { message: 'A specialist will reach out to schedule your call' };
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
    const orgNameById = new Map(
      orgs.map((org) => [String(org._id), org.name]),
    );
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
          pausedUntil: item.pausedUntil ?? null,
        };
      }),
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    };
  }
}