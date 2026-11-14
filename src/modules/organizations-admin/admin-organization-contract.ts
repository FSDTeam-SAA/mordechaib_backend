import { SubscriptionStatus } from '../../common/enums/subscription-status.enum';
import { PlanType } from '../../common/enums/plan-type.enum';

export enum AdminSubscriptionDisplayStatus {
  TRIALING = 'TRIALING',
  ACTIVE = 'ACTIVE',
  PAUSED = 'PAUSED',
  PAST_DUE = 'PAST_DUE',
  CANCELED = 'CANCELED',
  INCOMPLETE = 'INCOMPLETE',
}

export enum AdminPlanOptionAction {
  CURRENT = 'CURRENT',
  SWITCH = 'SWITCH',
  CONTACT_SALES = 'CONTACT_SALES',
  CHECKOUT_REQUIRED = 'CHECKOUT_REQUIRED',
  UNAVAILABLE = 'UNAVAILABLE',
}

export enum AdminOrganizationTrendDirection {
  UP = 'UP',
  DOWN = 'DOWN',
  FLAT = 'FLAT',
}

const SUBSCRIPTION_DISPLAY_STATUS: Record<
  SubscriptionStatus,
  AdminSubscriptionDisplayStatus
> = {
  [SubscriptionStatus.TRIALING]: AdminSubscriptionDisplayStatus.TRIALING,
  [SubscriptionStatus.ACTIVE]: AdminSubscriptionDisplayStatus.ACTIVE,
  [SubscriptionStatus.PAST_DUE]: AdminSubscriptionDisplayStatus.PAST_DUE,
  [SubscriptionStatus.CANCELED]: AdminSubscriptionDisplayStatus.CANCELED,
  [SubscriptionStatus.INCOMPLETE]: AdminSubscriptionDisplayStatus.INCOMPLETE,
};

type SubscriptionPresentationInput = {
  status: SubscriptionStatus;
  pausedUntil?: Date | string | null;
};

type PlanActionInput = {
  isCurrent: boolean;
  isInquiryOnly: boolean;
  supportsBillingInterval: boolean;
  hasManageableStripeSubscription: boolean;
};

type PlanCatalogInput = {
  id: string;
  planType: PlanType;
  name: string;
  tagline?: string | null;
  billingCycles?: ('month' | 'year')[];
  priceUsd?: number | null;
  annualPriceUsd?: number | null;
  features?: string[];
  aiActionsPerMonth?: number | null;
  crmContactsLimit?: number | null;
  callMinutesPerMonth?: number | null;
  meetingHoursPerMonth?: number | null;
  usersIncluded?: number | null;
  aiAgentsIncluded?: number | null;
  extraAiActionPriceUsd?: number | null;
  extraCallMinutePriceUsd?: number | null;
  customizationIncluded?: boolean;
  isMostPopular?: boolean;
  isInquiryOnly?: boolean;
};

type PlanOptionContext = {
  selectedBillingInterval: 'month' | 'year';
  currentPlanId: string | null;
  currentBillingInterval: 'month' | 'year';
  hasManageableStripeSubscription: boolean;
};

type AdminOrganizationSummaryInput = {
  asOf: Date;
  timezone: string;
  currentPeriod: { from: Date; to: Date };
  previousPeriod: { from: Date; to: Date };
  totalOrganizations: number;
  activeOrganizations: number;
  suspendedOrganizations: number;
  createdCurrentPeriod: number;
  suspendedCurrentPeriod: number;
  resumedCurrentPeriod: number;
  suspendedToday: number;
};

export function presentAdminSubscription<
  T extends SubscriptionPresentationInput,
>(subscription: T, now = new Date()) {
  const pausedUntil = subscription.pausedUntil
    ? new Date(subscription.pausedUntil)
    : null;
  const isPaused = Boolean(
    pausedUntil &&
    !Number.isNaN(pausedUntil.getTime()) &&
    pausedUntil.getTime() > now.getTime(),
  );

  return {
    ...subscription,
    displayStatus: isPaused
      ? AdminSubscriptionDisplayStatus.PAUSED
      : SUBSCRIPTION_DISPLAY_STATUS[subscription.status],
    isPaused,
  };
}

export function resolveAdminPlanOptionAction({
  isCurrent,
  isInquiryOnly,
  supportsBillingInterval,
  hasManageableStripeSubscription,
}: PlanActionInput): AdminPlanOptionAction {
  if (isCurrent) return AdminPlanOptionAction.CURRENT;
  if (isInquiryOnly) return AdminPlanOptionAction.CONTACT_SALES;
  if (!supportsBillingInterval) return AdminPlanOptionAction.UNAVAILABLE;
  if (!hasManageableStripeSubscription) {
    return AdminPlanOptionAction.CHECKOUT_REQUIRED;
  }
  return AdminPlanOptionAction.SWITCH;
}

export function canManageStripeSubscription(input?: {
  status?: SubscriptionStatus;
  stripeSubscriptionId?: string | null;
}) {
  return Boolean(
    input?.stripeSubscriptionId && input.status !== SubscriptionStatus.CANCELED,
  );
}

export function buildAdminPlanOption(
  plan: PlanCatalogInput,
  context: PlanOptionContext,
) {
  const billingCycles = plan.billingCycles?.length
    ? plan.billingCycles
    : ['month'];
  const supportsSelectedBillingInterval = billingCycles.includes(
    context.selectedBillingInterval,
  );
  const isCurrent =
    plan.id === context.currentPlanId &&
    context.currentBillingInterval === context.selectedBillingInterval;
  const action = resolveAdminPlanOptionAction({
    isCurrent,
    isInquiryOnly: plan.isInquiryOnly === true,
    supportsBillingInterval: supportsSelectedBillingInterval,
    hasManageableStripeSubscription: context.hasManageableStripeSubscription,
  });

  return {
    id: plan.id,
    planType: plan.planType,
    name: plan.name,
    tagline: plan.tagline ?? null,
    billingCycles,
    monthlyPriceUsd: plan.priceUsd ?? null,
    annualPriceUsd: plan.annualPriceUsd ?? null,
    selectedPriceUsd:
      context.selectedBillingInterval === 'year'
        ? (plan.annualPriceUsd ?? null)
        : (plan.priceUsd ?? null),
    features: plan.features ?? [],
    aiActionsPerMonth: plan.aiActionsPerMonth ?? null,
    crmContactsLimit: plan.crmContactsLimit ?? null,
    callMinutesPerMonth: plan.callMinutesPerMonth ?? null,
    meetingHoursPerMonth: plan.meetingHoursPerMonth ?? null,
    usersIncluded: plan.usersIncluded ?? null,
    aiAgentsIncluded: plan.aiAgentsIncluded ?? null,
    extraAiActionPriceUsd: plan.extraAiActionPriceUsd ?? null,
    extraCallMinutePriceUsd: plan.extraCallMinutePriceUsd ?? null,
    customizationIncluded: plan.customizationIncluded === true,
    isMostPopular: plan.isMostPopular === true,
    isInquiryOnly: plan.isInquiryOnly === true,
    isCurrent,
    supportsSelectedBillingInterval,
    action,
    canExecute: action === AdminPlanOptionAction.SWITCH,
  };
}

export function buildAdminOrganizationSummary(
  input: AdminOrganizationSummaryInput,
) {
  const previousTotal = Math.max(
    0,
    input.totalOrganizations - input.createdCurrentPeriod,
  );
  const previousActive = Math.max(
    0,
    input.activeOrganizations -
      input.createdCurrentPeriod +
      input.suspendedCurrentPeriod -
      input.resumedCurrentPeriod,
  );
  const previousSuspended = Math.max(
    0,
    input.suspendedOrganizations -
      input.suspendedCurrentPeriod +
      input.resumedCurrentPeriod,
  );

  return {
    asOf: input.asOf.toISOString(),
    timezone: input.timezone,
    comparisonBasis: 'POINT_IN_TIME_7_DAYS_AGO' as const,
    period: {
      current: {
        from: input.currentPeriod.from.toISOString(),
        to: input.currentPeriod.to.toISOString(),
      },
      previous: {
        from: input.previousPeriod.from.toISOString(),
        to: input.previousPeriod.to.toISOString(),
      },
    },
    totalOrganizations: input.totalOrganizations,
    activeOrganizations: input.activeOrganizations,
    suspendedOrganizations: input.suspendedOrganizations,
    suspendedToday: input.suspendedToday,
    comparisons: {
      totalOrganizations: adminOrganizationComparison(
        input.totalOrganizations,
        previousTotal,
      ),
      activeOrganizations: adminOrganizationComparison(
        input.activeOrganizations,
        previousActive,
      ),
      suspendedOrganizations: adminOrganizationComparison(
        input.suspendedOrganizations,
        previousSuspended,
      ),
    },
  };
}

function adminOrganizationComparison(current: number, previous: number) {
  const absoluteChange = current - previous;
  return {
    current,
    previous,
    absoluteChange,
    percentChange:
      previous > 0
        ? Math.round((absoluteChange / previous) * 1000) / 10
        : current === 0
          ? 0
          : null,
    direction:
      absoluteChange > 0
        ? AdminOrganizationTrendDirection.UP
        : absoluteChange < 0
          ? AdminOrganizationTrendDirection.DOWN
          : AdminOrganizationTrendDirection.FLAT,
    comparisonAvailable: previous > 0 || current === 0,
  };
}
