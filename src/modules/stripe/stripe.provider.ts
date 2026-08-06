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

  // --- Product/Price management, used by SubscriptionPlansService so an
  // admin never has to touch the Stripe dashboard to create a plan. ---

  createProduct(params: { name: string; description?: string }) {
    return this.client.products.create({
      name: params.name,
      description: params.description,
    });
  }

  updateProductName(productId: string, name: string) {
    return this.client.products.update(productId, { name });
  }

  // Stripe Prices are immutable — you can't edit an amount in place.
  // Changing a plan's price means creating a new Price under the same
  // Product and retiring the old one (see archivePrice below). Existing
  // subscribers keep billing at their original Price until they resubscribe
  // — only new checkouts pick up the new one.
  createPrice(params: {
    productId: string;
    unitAmountUsd: number;
    interval: 'month' | 'year';
  }) {
    return this.client.prices.create({
      product: params.productId,
      currency: 'usd',
      unit_amount: Math.round(params.unitAmountUsd * 100),
      recurring: { interval: params.interval },
    });
  }

  // Marks a Price inactive so it can no longer be used for new checkouts,
  // without deleting it (Stripe Prices can't be deleted, only archived —
  // and existing subscriptions referencing it are unaffected either way).
  archivePrice(priceId: string) {
    return this.client.prices.update(priceId, { active: false });
  }
}