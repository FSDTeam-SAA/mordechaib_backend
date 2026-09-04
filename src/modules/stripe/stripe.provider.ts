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

  // One-time payment (not a subscription) — used by onboarding-setups for
  // the Enterprise setup fee. Uses ad-hoc price_data since this amount
  // isn't backed by a pre-created Stripe Price the way plan checkout is.
  createOneTimeCheckoutSession(params: {
    amount: number;
    currency?: string;
    productName: string;
    customerEmail?: string;
    successUrl: string;
    cancelUrl: string;
    metadata: Record<string, string>;
  }) {
    return this.client.checkout.sessions.create({
      mode: 'payment',
      line_items: [
        {
          price_data: {
            currency: (params.currency || 'usd').toLowerCase(),
            unit_amount: Math.round(params.amount * 100),
            product_data: { name: params.productName },
          },
          quantity: 1,
        },
      ],
      customer_email: params.customerEmail,
      success_url: params.successUrl,
      cancel_url: params.cancelUrl,
      metadata: params.metadata,
    });
  }

  cancelSubscription(stripeSubscriptionId: string) {
    return this.client.subscriptions.update(stripeSubscriptionId, {
      cancel_at_period_end: true,
    });
  }

  // Screen 3 — no charges while paused; Stripe resumes billing on its own
  // at resumesAt (behavior 'void' means no invoices are generated at all
  // during the pause, as opposed to generating and marking them uncollectible).
  pauseSubscription(stripeSubscriptionId: string, resumesAt: Date) {
    return this.client.subscriptions.update(stripeSubscriptionId, {
      pause_collection: {
        behavior: 'void',
        resumes_at: Math.floor(resumesAt.getTime() / 1000),
      },
    });
  }

  // "Resume anytime with one click" — clears the pause early.
  resumeSubscription(stripeSubscriptionId: string) {
    return this.client.subscriptions.update(stripeSubscriptionId, {
      pause_collection: '',
    });
  }

  // Self-service upgrade — swaps the Price on the existing subscription
  // item with proration, rather than creating a second subscription the
  // way a fresh Checkout Session would.
  async upgradeSubscriptionPrice(
    stripeSubscriptionId: string,
    newPriceId: string,
  ) {
    const subscription =
      await this.client.subscriptions.retrieve(stripeSubscriptionId);
    const itemId = subscription.items.data[0]?.id;
    if (!itemId) {
      throw new Error(
        `Stripe subscription ${stripeSubscriptionId} has no items to update`,
      );
    }
    return this.client.subscriptions.update(stripeSubscriptionId, {
      items: [{ id: itemId, price: newPriceId }],
      proration_behavior: 'create_prorations',
    });
  }

  constructWebhookEvent(rawBody: Buffer, signature: string, secret: string) {
    return this.client.webhooks.constructEvent(rawBody, signature, secret);
  }

  createCallOverageInvoiceItem(params: {
    customerId: string;
    amountCents: number;
    organizationId: string;
    callSid: string;
    durationSeconds: number;
  }) {
    return this.client.invoiceItems.create(
      {
        customer: params.customerId,
        amount: params.amountCents,
        currency: 'usd',
        description: `Twilio call overage (${params.durationSeconds} seconds)`,
        metadata: {
          organizationId: params.organizationId,
          callSid: params.callSid,
        },
      },
      { idempotencyKey: `twilio-call-overage-${params.callSid}` },
    );
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
