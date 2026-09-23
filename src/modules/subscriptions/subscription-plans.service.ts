import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { AddonCategory } from '../../common/enums/addon-category.enum';
import { SubscriptionStatus } from '../../common/enums/subscription-status.enum';
import { AddonProductsService } from '../addons/addon-products.service';
import { OrganizationsService } from '../organizations/organizations.service';
import { StripeProvider } from '../stripe/stripe.provider';
import { CreateSubscriptionPlanDto } from './dto/create-subscription-plan.dto';
import { EstimateUsageQueryDto } from './dto/estimate-usage-query.dto';
import { ListSubscriptionsQueryDto } from './dto/list-subscriptions-query.dto';
import { UpdateSubscriptionPlanDto } from './dto/update-subscription-plan.dto';
import { SubscriptionPlansRepository } from './subscription-plans.repository';
import { SubscriptionsRepository } from './subscriptions.repository';

@Injectable()
export class SubscriptionPlansService implements OnModuleInit {
  constructor(
    private readonly repository: SubscriptionPlansRepository,
    private readonly subscriptionsRepository: SubscriptionsRepository,
    private readonly stripeProvider: StripeProvider,
    private readonly addonProductsService: AddonProductsService,
    private readonly organizationsService: OrganizationsService,
  ) {}

  // Every legacy Stripe price created by this service was monthly. Persist
  // that known value so older MongoDB documents expose the new field too.
  async onModuleInit() {
    await this.repository.backfillLegacyBillingCycles();
  }

  findAll(includeInactive = false, billingCycle?: 'month' | 'year') {
    return this.repository.findAll(includeInactive, billingCycle);
  }

  // Admin plan cards need live subscriber and revenue figures in the same
  // response as the catalog. The public pricing endpoint deliberately stays
  // catalog-only.
  async findAllForAdmin(
    includeInactive = true,
    billingCycle?: 'month' | 'year',
  ) {
    const plans = await this.repository.findAll(includeInactive, billingCycle);
    const stats = await this.subscriptionsRepository.getLiveStatsByPlanIds(
      plans.map((plan) => String(plan._id)),
    );
    const statsByPlanId = new Map(stats.map((stat) => [stat.planId, stat]));

    return plans.map((plan) => {
      const stat = statsByPlanId.get(String(plan._id));
      const monthlyRevenueUsd = stat?.monthlyRevenueUsd ?? 0;
      return {
        ...plan.toObject(),
        activeSubscriberCount: stat?.activeSubscriberCount ?? 0,
        monthlyRevenueUsd,
        annualRevenueUsd: monthlyRevenueUsd * 12,
      };
    });
  }

  async findById(id: string) {
    const plan = await this.repository.findById(id);
    if (!plan) throw new NotFoundException('Subscription plan not found');
    return plan;
  }

  async findByPlanType(planType: string) {
    const plan = await this.repository.findByPlanType(planType);
    if (!plan) throw new NotFoundException('Subscription plan not found');
    return plan;
  }

  findByIds(ids: string[]) {
    return this.repository.findByIds(ids);
  }

  // Stripe IDs are account-specific. Development databases are often reused
  // after switching sandbox keys, so verify the stored IDs and repair only
  // resources that are missing from the currently configured Stripe account.
  async ensureCheckoutPrice(
    id: string,
    billingCycle: 'month' | 'year' = 'month',
  ) {
    const plan = await this.findById(id);
    const billingCycles = plan.billingCycles?.length
      ? plan.billingCycles
      : ['month'];
    if (!billingCycles.includes(billingCycle)) {
      throw new BadRequestException(
        `This plan is not available for ${billingCycle}ly billing`,
      );
    }

    const amountUsd =
      billingCycle === 'year' ? plan.annualPriceUsd : plan.priceUsd;
    if (amountUsd == null) {
      throw new BadRequestException(
        `${billingCycle === 'year' ? 'annualPriceUsd' : 'priceUsd'} is not configured for this plan`,
      );
    }

    const productId = await this.stripeProvider.ensureProduct({
      productId: plan.stripeProductId,
      name: plan.name,
      description: plan.tagline,
    });
    const currentPriceId =
      billingCycle === 'year'
        ? plan.stripeAnnualPriceId
        : plan.stripePriceId;
    const priceId = await this.stripeProvider.ensureRecurringPrice({
      priceId: currentPriceId,
      productId,
      unitAmountUsd: amountUsd,
      interval: billingCycle,
    });

    if (productId !== plan.stripeProductId || priceId !== currentPriceId) {
      await this.repository.updateById(id, {
        stripeProductId: productId,
        ...(billingCycle === 'year'
          ? { stripeAnnualPriceId: priceId }
          : { stripePriceId: priceId }),
      });
    }
    return priceId;
  }

  // Creates the matching Stripe Product + Price automatically — admins
  // never provide a stripePriceId themselves (it isn't even a field on
  // CreateSubscriptionPlanDto).
  async create(dto: CreateSubscriptionPlanDto) {
    const existing = await this.repository.findByPlanType(dto.planType);
    if (existing) {
      throw new ConflictException(`A plan for ${dto.planType} already exists`);
    }

    if (!dto.isInquiryOnly && dto.priceUsd == null) {
      throw new BadRequestException(
        'priceUsd is required for a purchasable plan (omit it only when isInquiryOnly is true)',
      );
    }
    if (
      !dto.isInquiryOnly &&
      dto.billingCycles?.includes('year') &&
      dto.annualPriceUsd == null
    ) {
      throw new BadRequestException(
        'annualPriceUsd is required when the yearly billing cycle is enabled',
      );
    }

    let stripeProductId: string | undefined;
    let stripePriceId: string | undefined;
    let stripeAnnualPriceId: string | undefined;

    if (!dto.isInquiryOnly) {
      const product = await this.stripeProvider.createProduct({
        name: dto.name,
        description: dto.tagline,
      });
      const price = await this.stripeProvider.createPrice({
        productId: product.id,
        unitAmountUsd: dto.priceUsd!,
        interval: 'month',
      });
      stripeProductId = product.id;
      stripePriceId = price.id;
      if (dto.billingCycles?.includes('year')) {
        const annualPrice = await this.stripeProvider.createPrice({
          productId: product.id,
          unitAmountUsd: dto.annualPriceUsd!,
          interval: 'year',
        });
        stripeAnnualPriceId = annualPrice.id;
      }
    }

    return this.repository.create({
      ...dto,
      stripeProductId,
      stripePriceId,
      stripeAnnualPriceId,
    });
  }

  // Handles three cases automatically:
  // 1. Plan never had a Stripe Product/Price yet (e.g. it was created
  //    before this was automated, or is transitioning from inquiry-only
  //    to purchasable) — creates them now.
  // 2. priceUsd is actually changing — Stripe Prices are immutable, so
  //    this creates a new Price under the same Product and archives the
  //    old one. Existing subscribers keep billing at their original price
  //    — only new checkouts pick up the new price.
  // 3. Neither of the above — just a normal field update, no Stripe calls.
  async update(id: string, dto: UpdateSubscriptionPlanDto) {
    const existing = await this.findById(id);
    const patch: UpdateSubscriptionPlanDto & {
      stripeProductId?: string;
      stripePriceId?: string;
      stripeAnnualPriceId?: string;
    } = { ...dto };

    const willBeInquiryOnly = dto.isInquiryOnly ?? existing.isInquiryOnly;
    const nextBillingCycles =
      dto.billingCycles ??
      (existing.billingCycles?.length ? existing.billingCycles : ['month']);
    const nextAnnualPriceUsd = dto.annualPriceUsd ?? existing.annualPriceUsd;

    if (!willBeInquiryOnly) {
      const nextPriceUsd = dto.priceUsd ?? existing.priceUsd;
      if (nextPriceUsd == null) {
        throw new BadRequestException(
          'priceUsd is required for a purchasable plan',
        );
      }
      if (
        nextBillingCycles.includes('year') &&
        nextAnnualPriceUsd == null
      ) {
        throw new BadRequestException(
          'annualPriceUsd is required when the yearly billing cycle is enabled',
        );
      }

      if (!existing.stripeProductId) {
        const product = await this.stripeProvider.createProduct({
          name: dto.name ?? existing.name,
          description: dto.tagline ?? existing.tagline,
        });
        patch.stripeProductId = product.id;
        const price = await this.stripeProvider.createPrice({
          productId: product.id,
          unitAmountUsd: nextPriceUsd,
          interval: 'month',
        });
        patch.stripePriceId = price.id;
        if (nextBillingCycles.includes('year')) {
          const annualPrice = await this.stripeProvider.createPrice({
            productId: product.id,
            unitAmountUsd: nextAnnualPriceUsd!,
            interval: 'year',
          });
          patch.stripeAnnualPriceId = annualPrice.id;
        }
      } else if (dto.priceUsd !== undefined && dto.priceUsd !== existing.priceUsd) {
        const price = await this.stripeProvider.createPrice({
          productId: existing.stripeProductId,
          unitAmountUsd: dto.priceUsd,
          interval: 'month',
        });
        if (existing.stripePriceId) {
          await this.stripeProvider
            .archivePrice(existing.stripePriceId)
            .catch(() => undefined); // best-effort — don't fail the update over this
        }
        patch.stripePriceId = price.id;
      }

      if (
        existing.stripeProductId &&
        nextBillingCycles.includes('year') &&
        (!existing.stripeAnnualPriceId ||
          (dto.annualPriceUsd !== undefined &&
            dto.annualPriceUsd !== existing.annualPriceUsd))
      ) {
        const annualPrice = await this.stripeProvider.createPrice({
          productId: existing.stripeProductId,
          unitAmountUsd: nextAnnualPriceUsd!,
          interval: 'year',
        });
        if (existing.stripeAnnualPriceId) {
          await this.stripeProvider
            .archivePrice(existing.stripeAnnualPriceId)
            .catch(() => undefined);
        }
        patch.stripeAnnualPriceId = annualPrice.id;
      }

      if (existing.stripeProductId && dto.name && dto.name !== existing.name) {
        await this.stripeProvider
          .updateProductName(existing.stripeProductId, dto.name)
          .catch(() => undefined);
      }
    }

    const updated = await this.repository.updateById(id, patch);
    if (!updated) throw new NotFoundException('Subscription plan not found');
    return updated;
  }

  async delete(id: string) {
    const plan = await this.findById(id);
    const inUse = await this.subscriptionsRepository.existsForPlan(
      String(plan._id),
    );
    if (inUse) {
      throw new ConflictException(
        'This plan has active subscribers — deactivate it instead of deleting',
      );
    }
    await Promise.all(
      [plan.stripePriceId, plan.stripeAnnualPriceId]
        .filter((priceId): priceId is string => Boolean(priceId))
        .map((priceId) =>
          this.stripeProvider.archivePrice(priceId).catch(() => undefined),
        ),
    );
    await this.repository.deleteById(id);
    return { message: 'Subscription plan deleted' };
  }

  async listSubscribers(id: string, query: ListSubscriptionsQueryDto) {
    const plan = await this.findById(id);
    const page = query.page ?? 1;
    const limit = query.limit ?? 25;
    const { items, total } = await this.subscriptionsRepository.listForAdmin({
      planId: String(plan._id),
      status: query.status,
      billingInterval: query.billingInterval,
      // A card's subscriber count is live (ACTIVE + TRIALING), so the View
      // Subscribers action has the same default. An explicit status query is
      // available when an admin needs historical/cancelled records.
      statuses: query.status
        ? undefined
        : [SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIALING],
      page,
      limit,
    });
    const organizationIds = [...new Set(items.map((item) => item.organizationId))];
    const organizations = organizationIds.length
      ? await this.organizationsService.findByIds(organizationIds)
      : [];
    const organizationsById = new Map(
      organizations.map((organization) => [String(organization._id), organization]),
    );

    return {
      plan: { id: String(plan._id), planType: plan.planType, name: plan.name },
      items: items.map((item) => {
        const organization = organizationsById.get(item.organizationId);
        const monthlyRevenueUsd =
          item.pausedUntil && item.pausedUntil > new Date()
            ? 0
            : (item.snapshotLimits?.priceUsd ?? 0);
        return {
          organizationId: item.organizationId,
          organizationName: organization?.name ?? 'Unknown organization',
          organizationEmail: organization?.emailAddress ?? null,
          status: item.status,
          monthlyRevenueUsd,
          billingInterval: item.billingInterval ?? null,
          currentPeriodStart: item.currentPeriodStart ?? null,
          nextRenewal: item.currentPeriodEnd ?? null,
          pausedUntil: item.pausedUntil ?? null,
        };
      }),
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    };
  }

  // Usage estimator — called by the public pricing page sliders.
  // Returns the cheapest plan that covers the input + any add-on tiers
  // needed to cover the remaining gap.
  async estimateUsage(query: EstimateUsageQueryDto) {
    const monthlyCalls = query.monthlyCalls ?? 0;
    const monthlyActions = query.monthlyActions ?? 0;
    const meetingHours = query.meetingHours ?? 0;

    // Load active, purchasable plans cheapest-first
    const allPlans = await this.repository.findAll(false);
    const purchasablePlans = allPlans.filter((p) => !p.isInquiryOnly);
    purchasablePlans.sort((a, b) => (a.priceUsd ?? 0) - (b.priceUsd ?? 0));

    // Find the cheapest plan whose base limits cover ALL input values
    let recommendedPlan = purchasablePlans.find(
      (p) =>
        (p.callMinutesPerMonth ?? 0) >= monthlyCalls &&
        (p.aiActionsPerMonth ?? 0) >= monthlyActions &&
        (p.meetingHoursPerMonth ?? 0) >= meetingHours,
    );

    // If no single plan covers everything, use the most expensive purchasable plan
    if (!recommendedPlan) {
      recommendedPlan = purchasablePlans[purchasablePlans.length - 1];
    }

    if (!recommendedPlan) {
      return {
        recommendedPlan: null,
        estimatedAddons: [],
        totalEstimatedMonthlyUsd: 0,
      };
    }

    // Compute what's still not covered after the plan
    const callsGap = Math.max(
      0,
      monthlyCalls - (recommendedPlan.callMinutesPerMonth ?? 0),
    );
    const actionsGap = Math.max(
      0,
      monthlyActions - (recommendedPlan.aiActionsPerMonth ?? 0),
    );
    const meetingGap = Math.max(
      0,
      meetingHours - (recommendedPlan.meetingHoursPerMonth ?? 0),
    );

    // Load all active add-on products and find the smallest tier that covers each gap
    const addons = await this.addonProductsService.findAll(false);
    const estimatedAddons: {
      category: AddonCategory;
      addonProductId: string;
      tier: { label: string; quantity: number; priceUsd: number };
    }[] = [];

    const pickSmallestTier = (
      category: AddonCategory,
      gap: number,
    ) => {
      if (gap <= 0) return;
      const addonProduct = addons.find(
        (a) => a.category === category && !a.isInquiryOnly,
      );
      if (!addonProduct || addonProduct.tiers.length === 0) return;
      // Tiers sorted ascending by quantity — pick the first that covers the gap
      const sorted = [...addonProduct.tiers].sort(
        (a, b) => a.quantity - b.quantity,
      );
      const tier =
        sorted.find((t) => t.quantity >= gap) ??
        sorted[sorted.length - 1]; // fallback to largest if gap > max tier
      estimatedAddons.push({
        category,
        addonProductId: String((addonProduct as unknown as { _id: unknown })._id),
        tier: {
          label: tier.label,
          quantity: tier.quantity,
          priceUsd: tier.priceUsd,
        },
      });
    };

    pickSmallestTier(AddonCategory.VOICE_MINUTES, callsGap);
    pickSmallestTier(AddonCategory.AI_ACTIONS, actionsGap);
    pickSmallestTier(AddonCategory.AI_MEETING_CAPTURE, meetingGap);

    const addonTotal = estimatedAddons.reduce(
      (sum, a) => sum + a.tier.priceUsd,
      0,
    );
    const totalEstimatedMonthlyUsd =
      (recommendedPlan.priceUsd ?? 0) + addonTotal;

    return {
      recommendedPlan: {
        id: String((recommendedPlan as unknown as { _id: unknown })._id),
        planType: recommendedPlan.planType,
        name: recommendedPlan.name,
        priceUsd: recommendedPlan.priceUsd,
        limits: {
          callMinutesPerMonth: recommendedPlan.callMinutesPerMonth,
          aiActionsPerMonth: recommendedPlan.aiActionsPerMonth,
          meetingHoursPerMonth: recommendedPlan.meetingHoursPerMonth,
          crmContactsLimit: recommendedPlan.crmContactsLimit,
          usersIncluded: recommendedPlan.usersIncluded,
        },
      },
      estimatedAddons,
      totalEstimatedMonthlyUsd,
    };
  }
}
