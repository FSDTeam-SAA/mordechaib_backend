import Stripe from 'stripe';
import { InvoicesService } from '../invoices/invoices.service';
import { OnboardingSetupsService } from '../onboarding-setups/onboarding-setups.service';
import { StripeProvider } from '../stripe/stripe.provider';
import { SubscriptionPlansService } from '../subscriptions/subscription-plans.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { TwilioProvisioningService } from '../twilio/twilio-provisioning.service';
import { BillingService } from './billing.service';

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
