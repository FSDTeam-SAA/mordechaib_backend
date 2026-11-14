import { SubscriptionStatus } from '../../common/enums/subscription-status.enum';
import { PlanType } from '../../common/enums/plan-type.enum';
import {
  AdminPlanOptionAction,
  AdminOrganizationTrendDirection,
  AdminSubscriptionDisplayStatus,
  buildAdminOrganizationSummary,
  buildAdminPlanOption,
  canManageStripeSubscription,
  presentAdminSubscription,
  resolveAdminPlanOptionAction,
} from './admin-organization-contract';

describe('admin organization contract', () => {
  const now = new Date('2026-11-14T10:00:00.000Z');

  it('presents a future billing pause separately from organization status', () => {
    const result = presentAdminSubscription(
      {
        status: SubscriptionStatus.ACTIVE,
        pausedUntil: '2026-12-14T10:00:00.000Z',
      },
      now,
    );

    expect(result).toMatchObject({
      status: SubscriptionStatus.ACTIVE,
      displayStatus: AdminSubscriptionDisplayStatus.PAUSED,
      isPaused: true,
    });
  });

  it('does not present an expired pause as active', () => {
    const result = presentAdminSubscription(
      {
        status: SubscriptionStatus.PAST_DUE,
        pausedUntil: '2026-11-13T10:00:00.000Z',
      },
      now,
    );

    expect(result).toMatchObject({
      displayStatus: AdminSubscriptionDisplayStatus.PAST_DUE,
      isPaused: false,
    });
  });

  it.each([
    [
      'current selection',
      {
        isCurrent: true,
        isInquiryOnly: false,
        supportsBillingInterval: true,
        hasManageableStripeSubscription: true,
      },
      AdminPlanOptionAction.CURRENT,
    ],
    [
      'inquiry-only plan',
      {
        isCurrent: false,
        isInquiryOnly: true,
        supportsBillingInterval: true,
        hasManageableStripeSubscription: true,
      },
      AdminPlanOptionAction.CONTACT_SALES,
    ],
    [
      'unsupported billing interval',
      {
        isCurrent: false,
        isInquiryOnly: false,
        supportsBillingInterval: false,
        hasManageableStripeSubscription: true,
      },
      AdminPlanOptionAction.UNAVAILABLE,
    ],
    [
      'organization without a manageable Stripe subscription',
      {
        isCurrent: false,
        isInquiryOnly: false,
        supportsBillingInterval: true,
        hasManageableStripeSubscription: false,
      },
      AdminPlanOptionAction.CHECKOUT_REQUIRED,
    ],
    [
      'eligible plan switch',
      {
        isCurrent: false,
        isInquiryOnly: false,
        supportsBillingInterval: true,
        hasManageableStripeSubscription: true,
      },
      AdminPlanOptionAction.SWITCH,
    ],
  ])('resolves %s to a deterministic UI action', (_label, input, expected) => {
    expect(resolveAdminPlanOptionAction(input)).toBe(expected);
  });

  it('does not expose a cancelled Stripe subscription as manageable', () => {
    expect(
      canManageStripeSubscription({
        status: SubscriptionStatus.CANCELED,
        stripeSubscriptionId: 'sub_cancelled',
      }),
    ).toBe(false);
    expect(
      canManageStripeSubscription({
        status: SubscriptionStatus.ACTIVE,
        stripeSubscriptionId: 'sub_active',
      }),
    ).toBe(true);
  });

  it('builds a dynamic inquiry-only card without enabling direct execution', () => {
    const result = buildAdminPlanOption(
      {
        id: 'custom-plan',
        planType: PlanType.CUSTOM,
        name: 'Customized',
        tagline: 'Tailored infrastructure',
        billingCycles: ['month', 'year'],
        isInquiryOnly: true,
        features: ['Custom SLA'],
        customizationIncluded: true,
      },
      {
        selectedBillingInterval: 'year',
        currentPlanId: 'growth-plan',
        currentBillingInterval: 'month',
        hasManageableStripeSubscription: true,
      },
    );

    expect(result).toMatchObject({
      action: AdminPlanOptionAction.CONTACT_SALES,
      canExecute: false,
      selectedPriceUsd: null,
      features: ['Custom SLA'],
      customizationIncluded: true,
    });
  });

  it('marks a supported paid plan as directly switchable', () => {
    const result = buildAdminPlanOption(
      {
        id: 'growth-plan',
        planType: PlanType.GROWTH,
        name: 'Growth',
        billingCycles: ['month', 'year'],
        priceUsd: 149,
        annualPriceUsd: 1430,
      },
      {
        selectedBillingInterval: 'year',
        currentPlanId: 'payg-plan',
        currentBillingInterval: 'month',
        hasManageableStripeSubscription: true,
      },
    );

    expect(result).toMatchObject({
      action: AdminPlanOptionAction.SWITCH,
      canExecute: true,
      selectedPriceUsd: 1430,
      supportsSelectedBillingInterval: true,
    });
  });

  it('reconstructs previous organization counts from measured transitions', () => {
    const result = buildAdminOrganizationSummary({
      asOf: new Date('2026-11-14T10:00:00.000Z'),
      timezone: 'Asia/Dhaka',
      currentPeriod: {
        from: new Date('2026-11-07T10:00:00.000Z'),
        to: new Date('2026-11-14T10:00:00.000Z'),
      },
      previousPeriod: {
        from: new Date('2026-10-31T10:00:00.000Z'),
        to: new Date('2026-11-07T10:00:00.000Z'),
      },
      totalOrganizations: 100,
      activeOrganizations: 80,
      suspendedOrganizations: 20,
      createdCurrentPeriod: 10,
      suspendedCurrentPeriod: 3,
      resumedCurrentPeriod: 1,
      suspendedToday: 2,
    });

    expect(result).toMatchObject({
      suspendedToday: 2,
      comparisons: {
        totalOrganizations: {
          current: 100,
          previous: 90,
          absoluteChange: 10,
          percentChange: 11.1,
          direction: AdminOrganizationTrendDirection.UP,
        },
        activeOrganizations: {
          current: 80,
          previous: 72,
          absoluteChange: 8,
        },
        suspendedOrganizations: {
          current: 20,
          previous: 18,
          absoluteChange: 2,
        },
      },
    });
  });
});
