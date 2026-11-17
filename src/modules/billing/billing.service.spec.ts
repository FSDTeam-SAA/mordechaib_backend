import Stripe from 'stripe';
import { PlanType } from '../../common/enums/plan-type.enum';
import { InvoicesService } from '../invoices/invoices.service';
import { OnboardingSetupsService } from '../onboarding-setups/onboarding-setups.service';
import { StripeProvider } from '../stripe/stripe.provider';
import { SubscriptionPlansService } from '../subscriptions/subscription-plans.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { TwilioProvisioningService } from '../twilio/twilio-provisioning.service';
import { BillingService } from './billing.service';
import { AddonProductsService } from '../addons/addon-products.service';
import { UsageBillingService } from './usage-billing.service';

describe('BillingService onboarding payment webhook', () => {
  it('confirms a paid onboarding checkout without running subscription activation', async () => {
    const subscriptions = { activateSubscription: jest.fn() };
    const onboardingSetups = {
      confirmStripePayment: jest.fn(),
      markStripePaymentFailed: jest.fn(),
    };
    const service = new BillingService(
      {} as StripeProvider,
      {} as SubscriptionPlansService,
      subscriptions as unknown as SubscriptionsService,
      {} as InvoicesService,
      {} as TwilioProvisioningService,
      onboardingSetups as unknown as OnboardingSetupsService,
      {} as AddonProductsService,
      {} as UsageBillingService,
    );
    const event = {
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_onboarding_123',
          mode: 'payment',
          payment_status: 'paid',
          payment_intent: 'pi_onboarding_123',
          metadata: { onboardingSetupId: 'setup_123' },
        },
      },
    } as unknown as Stripe.Event;

    await expect(service.handleStripeEvent(event)).resolves.toEqual({
      received: true,
    });

    expect(onboardingSetups.confirmStripePayment).toHaveBeenCalledWith({
      setupId: 'setup_123',
      checkoutSessionId: 'cs_onboarding_123',
      paymentIntentId: 'pi_onboarding_123',
    });
    expect(subscriptions.activateSubscription).not.toHaveBeenCalled();
  });

  it('marks an expired onboarding checkout as failed so it can be retried', async () => {
    const onboardingSetups = {
      confirmStripePayment: jest.fn(),
      markStripePaymentFailed: jest.fn(),
    };
    const service = new BillingService(
      {} as StripeProvider,
      {} as SubscriptionPlansService,
      {} as SubscriptionsService,
      {} as InvoicesService,
      {} as TwilioProvisioningService,
      onboardingSetups as unknown as OnboardingSetupsService,
      {} as AddonProductsService,
      {} as UsageBillingService,
    );
    const event = {
      type: 'checkout.session.expired',
      data: {
        object: {
          id: 'cs_onboarding_expired',
          mode: 'payment',
          payment_intent: 'pi_onboarding_expired',
          metadata: { onboardingSetupId: 'setup_expired' },
        },
      },
    } as unknown as Stripe.Event;

    await expect(service.handleStripeEvent(event)).resolves.toEqual({
      received: true,
    });

    expect(onboardingSetups.markStripePaymentFailed).toHaveBeenCalledWith({
      setupId: 'setup_expired',
      checkoutSessionId: 'cs_onboarding_expired',
      paymentIntentId: 'pi_onboarding_expired',
      failureCode: 'checkout.session.expired',
    });
  });
});

describe('BillingService subscription checkout', () => {
  const createService = () => {
    const stripe = { createCheckoutSession: jest.fn() };
    const plans = {
      findByPlanType: jest.fn(),
      ensureCheckoutPrice: jest.fn(),
    };
    const subscriptions = { getMine: jest.fn() };
    const service = new BillingService(
      stripe as unknown as StripeProvider,
      plans as unknown as SubscriptionPlansService,
      subscriptions as unknown as SubscriptionsService,
      {} as InvoicesService,
      {} as TwilioProvisioningService,
      {} as OnboardingSetupsService,
      {} as AddonProductsService,
      {} as UsageBillingService,
    );
    return { service, stripe, plans, subscriptions };
  };

  it('collects a card without an upfront charge for pay as you go', async () => {
    const { service, stripe, plans, subscriptions } = createService();
    subscriptions.getMine.mockRejectedValue(new Error('not found'));
    plans.findByPlanType.mockResolvedValue({
      _id: 'plan-payg',
      planType: PlanType.PAY_AS_YOU_GO,
      isActive: true,
      isInquiryOnly: false,
      trialDays: 0,
    });
    plans.ensureCheckoutPrice.mockResolvedValue('price-payg-zero');
    stripe.createCheckoutSession.mockResolvedValue({
      url: 'https://checkout.stripe.test/payg',
    });

    const result = await service.createCheckoutSession('organization-1', {
      planType: PlanType.PAY_AS_YOU_GO,
      successUrl: 'https://app.test/success',
      cancelUrl: 'https://app.test/cancel',
    });

    expect(plans.ensureCheckoutPrice).toHaveBeenCalledWith(
      'plan-payg',
      'month',
    );
    expect(stripe.createCheckoutSession).toHaveBeenCalledWith(
      expect.objectContaining({
        priceId: 'price-payg-zero',
        paymentMethodCollection: 'always',
        metadata: expect.objectContaining({
          organizationId: 'organization-1',
          planId: 'plan-payg',
          billingInterval: 'month',
        }),
      }),
    );
    expect(result).toMatchObject({
      checkoutMode: 'PAYMENT_METHOD_AND_SUBSCRIPTION',
      planType: PlanType.PAY_AS_YOU_GO,
      billingCycle: 'month',
    });
  });

  it('uses the annual Stripe price for yearly paid-plan checkout', async () => {
    const { service, stripe, plans, subscriptions } = createService();
    subscriptions.getMine.mockRejectedValue(new Error('not found'));
    plans.findByPlanType.mockResolvedValue({
      _id: 'plan-growth',
      planType: PlanType.GROWTH,
      isActive: true,
      isInquiryOnly: false,
      trialDays: 0,
    });
    plans.ensureCheckoutPrice.mockResolvedValue('price-growth-year');
    stripe.createCheckoutSession.mockResolvedValue({
      url: 'https://checkout.stripe.test/growth',
    });

    const result = await service.createCheckoutSession('organization-1', {
      planType: PlanType.GROWTH,
      billingCycle: 'year',
      successUrl: 'https://app.test/success',
      cancelUrl: 'https://app.test/cancel',
    });

    expect(plans.ensureCheckoutPrice).toHaveBeenCalledWith(
      'plan-growth',
      'year',
    );
    expect(stripe.createCheckoutSession).toHaveBeenCalledWith(
      expect.objectContaining({
        paymentMethodCollection: undefined,
        metadata: expect.objectContaining({ billingInterval: 'year' }),
      }),
    );
    expect(result).toMatchObject({
      checkoutMode: 'SUBSCRIPTION',
      billingCycle: 'year',
    });
  });

  it('does not create a second checkout for an active subscription', async () => {
    const { service, stripe, plans, subscriptions } = createService();
    subscriptions.getMine.mockResolvedValue({
      subscription: { status: 'ACTIVE' },
    });

    await expect(
      service.createCheckoutSession('organization-1', {
        planType: PlanType.GROWTH,
        successUrl: 'https://app.test/success',
        cancelUrl: 'https://app.test/cancel',
      }),
    ).rejects.toThrow('already has a subscription');
    expect(plans.findByPlanType).not.toHaveBeenCalled();
    expect(stripe.createCheckoutSession).not.toHaveBeenCalled();
  });
});
