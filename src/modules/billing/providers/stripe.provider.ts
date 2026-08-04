import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';

@Injectable()
export class StripeProvider {
  readonly client: Stripe;

  constructor(private readonly config: ConfigService) {
    const secretKey = this.config.get<string>('stripe.secretKey') || '';
    this.client = new Stripe(secretKey);
  }

  createCheckoutSession(params: {
    priceId: string;
    customerId?: string;
    customerEmail?: string;
    successUrl: string;
    cancelUrl: string;
    metadata: Record<string, string>;
    trialDays?: number;
  }) {
    return this.client.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: params.priceId, quantity: 1 }],
      customer: params.customerId,
      customer_email: params.customerId ? undefined : params.customerEmail,
      success_url: params.successUrl,
      cancel_url: params.cancelUrl,
      subscription_data: {
        metadata: params.metadata,
        trial_period_days: params.trialDays || undefined,
      },
      metadata: params.metadata,
    });
  }

  cancelSubscription(stripeSubscriptionId: string) {
    return this.client.subscriptions.update(stripeSubscriptionId, {
      cancel_at_period_end: true,
    });
  }

  constructWebhookEvent(rawBody: Buffer, signature: string, secret: string) {
    return this.client.webhooks.constructEvent(rawBody, signature, secret);
  }
}
