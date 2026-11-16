import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { AddonCategory } from '../../common/enums/addon-category.enum';
import { PlanType } from '../../common/enums/plan-type.enum';
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

  // Smart Upgrade Calculator — called by the public pricing page sliders.
  // Computes Pay as you go costs ($0.04/action, $0.20/call min, $1.00/meeting hr)
  // vs fixed plans (Growth $149/mo, Enterprise $349/mo) and recommends the optimal
  // subscription plan + necessary add-on packs to cover the user's required usage.
  async estimateUsage(query: EstimateUsageQueryDto) {
    const monthlyCalls = Math.max(
      0,
      query.callMinutes ?? query.monthlyCalls ?? 0,
    );
    const monthlyActions = Math.max(
      0,
      query.aiActions ?? query.monthlyActions ?? 0,
    );
    const monthlyMeetings = Math.max(
      0,
      query.aiMeetings ?? query.monthlyMeetings ?? query.meetingHours ?? 0,
    );

    // Load active plans and active add-on products
    const [allPlans, allAddons] = await Promise.all([
      this.repository.findAll(false),
      this.addonProductsService.findAll(false),
    ]);

    // 1. Pay as you go calculation
    const payAsYouGoPlan = allPlans.find(
      (p) => p.planType === PlanType.PAY_AS_YOU_GO,
    );
    const actionRate = payAsYouGoPlan?.extraAiActionPriceUsd ?? 0.04;
    const callRate = payAsYouGoPlan?.extraCallMinutePriceUsd ?? 0.2;
    const meetingRate =
      query.meetingRateUsd ??
      payAsYouGoPlan?.extraAiCallMinute ??
      payAsYouGoPlan?.extraMeetingHourPriceUsd ??
      1.0;

    const aiActionsCost = Number((monthlyActions * actionRate).toFixed(2));
    const callMinutesCost = Number((monthlyCalls * callRate).toFixed(2));
    const aiMeetingsCost = Number((monthlyMeetings * meetingRate).toFixed(2));
    const payAsYouGoTotalUsd = Number(
      (aiActionsCost + callMinutesCost + aiMeetingsCost).toFixed(2),
    );

    // 2. Fixed subscription plans (Growth, Enterprise)
    const fixedPlans = allPlans
      .filter((p) => !p.isInquiryOnly && (p.priceUsd ?? 0) > 0)
      .sort((a, b) => (a.priceUsd ?? 0) - (b.priceUsd ?? 0));

    // Helper: for a given gap and category, find optimal add-on pack(s)
    const findCheapestAddonPacks = (category: AddonCategory, gap: number) => {
      if (gap <= 0) return [];
      const addonProduct = allAddons.find(
        (a) => a.category === category && !a.isInquiryOnly && a.isActive,
      );
      if (!addonProduct || !addonProduct.tiers || addonProduct.tiers.length === 0) {
        return [];
      }
      const sortedTiers = [...addonProduct.tiers].sort(
        (a, b) => a.quantity - b.quantity,
      );

      const unitLabel =
        category === AddonCategory.AI_MEETING_CAPTURE
          ? 'meeting hours'
          : category === AddonCategory.VOICE_MINUTES
            ? 'call minutes'
            : 'AI actions';

      // 1. If gap <= largest tier, pick the smallest tier >= gap
      const singleTier = sortedTiers.find((t) => t.quantity >= gap);
      if (singleTier) {
        return [
          {
            category,
            name: addonProduct.name,
            addonProductId: String(
              (addonProduct as unknown as { _id: unknown })._id,
            ),
            label: singleTier.label,
            quantity: singleTier.quantity,
            priceUsd: singleTier.priceUsd,
            units: unitLabel,
            reason: `Covers ${gap} additional ${unitLabel} needed`,
          },
        ];
      }

      // 2. If gap exceeds largest tier: use multiples of largest tier + smallest remainder
      const largestTier = sortedTiers[sortedTiers.length - 1];
      const countLargest = Math.floor(gap / largestTier.quantity);
      const remainder = gap % largestTier.quantity;

      const packs: {
        category: AddonCategory;
        name: string;
        addonProductId: string;
        label: string;
        quantity: number;
        priceUsd: number;
        units: string;
        reason: string;
      }[] = [];

      for (let i = 0; i < countLargest; i++) {
        packs.push({
          category,
          name: addonProduct.name,
          addonProductId: String(
            (addonProduct as unknown as { _id: unknown })._id,
          ),
          label: largestTier.label,
          quantity: largestTier.quantity,
          priceUsd: largestTier.priceUsd,
          units: unitLabel,
          reason: `Covers ${largestTier.quantity} of ${gap} ${unitLabel} needed`,
        });
      }

      if (remainder > 0) {
        const remainderTier =
          sortedTiers.find((t) => t.quantity >= remainder) ?? largestTier;
        packs.push({
          category,
          name: addonProduct.name,
          addonProductId: String(
            (addonProduct as unknown as { _id: unknown })._id,
          ),
          label: remainderTier.label,
          quantity: remainderTier.quantity,
          priceUsd: remainderTier.priceUsd,
          units: unitLabel,
          reason: `Covers remaining ${remainder} ${unitLabel} needed`,
        });
      }

      return packs;
    };

    // Evaluate each candidate plan
    type CandidatePlan = {
      plan: (typeof fixedPlans)[0];
      basePriceUsd: number;
      addons: ReturnType<typeof findCheapestAddonPacks>;
      addonsTotalUsd: number;
      totalCostUsd: number;
      excessActions: number;
      excessCalls: number;
      excessMeetings: number;
    };

    const candidates: CandidatePlan[] = fixedPlans.map((plan) => {
      const planActions = plan.aiActionsPerMonth ?? 0;
      const planCalls = plan.callMinutesPerMonth ?? 0;
      const planMeetings = plan.meetingHoursPerMonth ?? 0;

      const excessActions = Math.max(0, monthlyActions - planActions);
      const excessCalls = Math.max(0, monthlyCalls - planCalls);
      const excessMeetings = Math.max(0, monthlyMeetings - planMeetings);

      const actionPacks = findCheapestAddonPacks(
        AddonCategory.AI_ACTIONS,
        excessActions,
      );
      const callPacks = findCheapestAddonPacks(
        AddonCategory.VOICE_MINUTES,
        excessCalls,
      );
      const meetingPacks = findCheapestAddonPacks(
        AddonCategory.AI_MEETING_CAPTURE,
        excessMeetings,
      );

      const addons = [...actionPacks, ...callPacks, ...meetingPacks];
      const addonsTotalUsd = addons.reduce((sum, a) => sum + a.priceUsd, 0);
      const basePriceUsd = plan.priceUsd ?? 0;
      const totalCostUsd = Number((basePriceUsd + addonsTotalUsd).toFixed(2));

      return {
        plan,
        basePriceUsd,
        addons,
        addonsTotalUsd,
        totalCostUsd,
        excessActions,
        excessCalls,
        excessMeetings,
      };
    });

    // Best candidate is the one that has the minimum total cost, or if equal, the higher tier plan
    let bestCandidate: CandidatePlan | undefined;
    if (candidates.length > 0) {
      bestCandidate = [...candidates].sort((a, b) => {
        if (a.totalCostUsd !== b.totalCostUsd) {
          return a.totalCostUsd - b.totalCostUsd;
        }
        return b.basePriceUsd - a.basePriceUsd;
      })[0];
    }

    const targetSubscriptionPlan = bestCandidate?.plan;
    const recommendedAddons = bestCandidate?.addons ?? [];
    const addonsTotalUsd = bestCandidate?.addonsTotalUsd ?? 0;
    const subscriptionBasePrice = bestCandidate?.basePriceUsd ?? 0;
    const subscriptionTotalCostUsd =
      bestCandidate?.totalCostUsd ?? subscriptionBasePrice;

    const isWithinIncludedUsage =
      Boolean(targetSubscriptionPlan) &&
      (targetSubscriptionPlan?.aiActionsPerMonth ?? 0) >= monthlyActions &&
      (targetSubscriptionPlan?.callMinutesPerMonth ?? 0) >= monthlyCalls &&
      (targetSubscriptionPlan?.meetingHoursPerMonth ?? 0) >= monthlyMeetings;

    // Check if upgrade is recommended over Pay As You Go
    const isUpgradeRecommended =
      Boolean(targetSubscriptionPlan) &&
      (payAsYouGoTotalUsd > subscriptionTotalCostUsd ||
        (payAsYouGoTotalUsd >= 100 &&
          subscriptionTotalCostUsd <= payAsYouGoTotalUsd * 1.15));

    const monthlySavingsUsd = isUpgradeRecommended
      ? Math.max(
          0,
          Number((payAsYouGoTotalUsd - subscriptionTotalCostUsd).toFixed(2)),
        )
      : 0;

    const recommendationBadge = isUpgradeRecommended
      ? monthlySavingsUsd > 0
        ? 'Upgrade and save'
        : 'Predictable monthly pricing'
      : 'Pay as you go';

    const recommendationMessage = isUpgradeRecommended
      ? `${targetSubscriptionPlan?.name ?? 'Growth'} ${recommendedAddons.length > 0 ? 'with add-ons ' : ''}is more economical than Pay as you go.`
      : 'Pay as you go is currently the most economical choice for your expected volume.';

    // Build human-readable summary
    let summary = '';
    if (isUpgradeRecommended && targetSubscriptionPlan) {
      if (recommendedAddons.length > 0) {
        const addonSummary = recommendedAddons
          .map((a) => `${a.label} ($${a.priceUsd})`)
          .join(', ');
        summary = `Recommended: ${targetSubscriptionPlan.name} plan ($${subscriptionBasePrice}/mo) + Add-ons: ${addonSummary}. Total $${subscriptionTotalCostUsd}/mo (Save $${monthlySavingsUsd.toFixed(2)}/mo vs Pay as you go).`;
      } else {
        summary = `Recommended: ${targetSubscriptionPlan.name} plan ($${subscriptionBasePrice}/mo). All selected usage is included! (Save $${monthlySavingsUsd.toFixed(2)}/mo vs Pay as you go).`;
      }
    } else {
      summary =
        'Pay as you go is currently the most economical choice for your expected volume.';
    }

    return {
      // Primary Output
      estimatedMonthlyCost: payAsYouGoTotalUsd,
      formattedEstimatedMonthlyCost: `$${payAsYouGoTotalUsd.toFixed(2)}`,

      payAsYouGo: {
        name: payAsYouGoPlan?.name ?? 'Pay as you go',
        planType: PlanType.PAY_AS_YOU_GO,
        totalCostUsd: payAsYouGoTotalUsd,
        formattedTotal: `$${payAsYouGoTotalUsd.toFixed(2)}`,
        rates: {
          aiActionRateUsd: actionRate,
          callMinuteRateUsd: callRate,
          aiMeetingRateUsd: meetingRate,
        },
        breakdown: {
          aiActions: {
            quantity: monthlyActions,
            rateUsd: actionRate,
            costUsd: aiActionsCost,
            formattedCost: `$${aiActionsCost.toFixed(2)}`,
          },
          callMinutes: {
            quantity: monthlyCalls,
            rateUsd: callRate,
            costUsd: callMinutesCost,
            formattedCost: `$${callMinutesCost.toFixed(2)}`,
          },
          aiMeetings: {
            quantity: monthlyMeetings,
            rateUsd: meetingRate,
            costUsd: aiMeetingsCost,
            formattedCost: `$${aiMeetingsCost.toFixed(2)}`,
          },
        },
      },

      subscription: targetSubscriptionPlan
        ? {
            id: String(
              (targetSubscriptionPlan as unknown as { _id: unknown })._id,
            ),
            planType: targetSubscriptionPlan.planType,
            name: targetSubscriptionPlan.name,
            displayName: `${targetSubscriptionPlan.name} subscription`,
            priceUsd: subscriptionBasePrice,
            formattedPrice: `$${subscriptionBasePrice}/month`,
            billingCycle: 'month',
            limits: {
              callMinutesPerMonth: targetSubscriptionPlan.callMinutesPerMonth,
              aiActionsPerMonth: targetSubscriptionPlan.aiActionsPerMonth,
              meetingHoursPerMonth:
                targetSubscriptionPlan.meetingHoursPerMonth,
              crmContactsLimit: targetSubscriptionPlan.crmContactsLimit,
              usersIncluded: targetSubscriptionPlan.usersIncluded,
            },
            isWithinIncludedUsage,
            addonsPriceUsd: addonsTotalUsd,
            estimatedTotalCostUsd: subscriptionTotalCostUsd,
            formattedEstimatedTotalCost: `$${subscriptionTotalCostUsd.toFixed(2)}`,
          }
        : null,

      recommendedAddons,
      bundlePricing: {
        basePlanPriceUsd: subscriptionBasePrice,
        addonsPriceUsd: addonsTotalUsd,
        totalMonthlyPriceUsd: subscriptionTotalCostUsd,
        formattedTotal: `$${subscriptionTotalCostUsd.toFixed(2)}/month`,
        monthlySavingsUsd,
        formattedSavings:
          monthlySavingsUsd > 0
            ? `$${monthlySavingsUsd.toFixed(2)}/month`
            : null,
        summary,
      },

      comparison: {
        isUpgradeRecommended,
        recommendation: isUpgradeRecommended
          ? 'CONSIDER_UPGRADING'
          : 'STAY_ON_PAY_AS_YOU_GO',
        badge: recommendationBadge,
        headline: targetSubscriptionPlan?.name ?? 'Enterprise',
        message: recommendationMessage,
        monthlySavingsUsd,
        formattedSavings:
          monthlySavingsUsd > 0
            ? `$${monthlySavingsUsd.toFixed(2)}/month`
            : null,
        payAsYouGoTotalUsd,
        subscriptionTotalUsd: subscriptionTotalCostUsd,
        footnote:
          'Illustrative pricing only. Meeting rate is $1.00/hour.',
      },

      // Legacy compatibility
      recommendedPlan:
        isUpgradeRecommended && targetSubscriptionPlan
          ? {
              id: String(
                (targetSubscriptionPlan as unknown as { _id: unknown })._id,
              ),
              planType: targetSubscriptionPlan.planType,
              name: targetSubscriptionPlan.name,
              priceUsd: subscriptionBasePrice,
              limits: {
                callMinutesPerMonth: targetSubscriptionPlan.callMinutesPerMonth,
                aiActionsPerMonth: targetSubscriptionPlan.aiActionsPerMonth,
                meetingHoursPerMonth:
                  targetSubscriptionPlan.meetingHoursPerMonth,
                crmContactsLimit: targetSubscriptionPlan.crmContactsLimit,
                usersIncluded: targetSubscriptionPlan.usersIncluded,
              },
            }
          : payAsYouGoPlan
            ? {
                id: String(
                  (payAsYouGoPlan as unknown as { _id: unknown })._id,
                ),
                planType: payAsYouGoPlan.planType,
                name: payAsYouGoPlan.name,
                priceUsd: payAsYouGoPlan.priceUsd,
                limits: {
                  callMinutesPerMonth: payAsYouGoPlan.callMinutesPerMonth,
                  aiActionsPerMonth: payAsYouGoPlan.aiActionsPerMonth,
                  meetingHoursPerMonth: payAsYouGoPlan.meetingHoursPerMonth,
                  crmContactsLimit: payAsYouGoPlan.crmContactsLimit,
                  usersIncluded: payAsYouGoPlan.usersIncluded,
                },
              }
            : null,
      recommendedPlanSummary: summary,
      estimatedAddons: recommendedAddons.map((a) => ({
        category: a.category,
        addonProductId: a.addonProductId,
        tier: {
          label: a.label,
          quantity: a.quantity,
          priceUsd: a.priceUsd,
        },
      })),
      totalEstimatedMonthlyUsd: subscriptionTotalCostUsd,
    };
  }
}
