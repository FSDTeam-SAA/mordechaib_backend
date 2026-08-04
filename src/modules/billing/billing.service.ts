import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import Stripe from 'stripe';
import { PlanType } from '../../common/enums/plan-type.enum';
import { SubscriptionStatus } from '../../common/enums/subscription-status.enum';
import { SubscriptionPlansService } from '../subscriptions/subscription-plans.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { CreateCheckoutSessionDto } from './dto/create-checkout-session.dto';
import { StripeProvider } from './providers/stripe.provider';

// Maps Stripe's own subscription statuses onto ours. Stripe has a couple of
// extra states (`unpaid`, `paused`) that we fold into PAST_DUE/CANCELED
// rather than modelling separately.
const STRIPE_STATUS_MAP: Record<
  Stripe.Subscription.Status,
  SubscriptionStatus
> = {
  trialing: SubscriptionStatus.TRIALING,
  active: SubscriptionStatus.ACTIVE,
  past_due: SubscriptionStatus.PAST_DUE,
  unpaid: SubscriptionStatus.PAST_DUE,
  canceled: SubscriptionStatus.CANCELED,
  incomplete: SubscriptionStatus.INCOMPLETE,
  incomplete_expired: SubscriptionStatus.CANCELED,
  paused: SubscriptionStatus.CANCELED,
};

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);

  constructor(
    private readonly stripeProvider: StripeProvider,
    private readonly plansService: SubscriptionPlansService,
    private readonly subscriptionsService: SubscriptionsService,
  ) {}

  async createCheckoutSession(
    organizationId: string,
    dto: CreateCheckoutSessionDto,
  ) {
    if (dto.planType === PlanType.CUSTOM) {
      throw new BadRequestException(
        'The Customized plan is inquiry-only — submit a package inquiry instead',
      );
    }

    const plan = await this.plansService.findByPlanType(dto.planType);
    if (!plan.stripePriceId) {
      throw new BadRequestException(
        'This plan is not yet linked to a Stripe price',
      );
    }

    const session = await this.stripeProvider.createCheckoutSession({
      priceId: plan.stripePriceId,
      successUrl: dto.successUrl,
      cancelUrl: dto.cancelUrl,
      trialDays: plan.trialDays,
      metadata: {
        organizationId,
        planId: String(plan._id),
      },
    });

    return { checkoutUrl: session.url };
  }

  async cancelSubscription(organizationId: string) {
    const { subscription } =
      await this.subscriptionsService.getMine(organizationId);
    if (!subscription.stripeSubscriptionId) {
      throw new BadRequestException('No active Stripe subscription found');
    }

    await this.stripeProvider.cancelSubscription(
      subscription.stripeSubscriptionId,
    );
    // Reflect immediately rather than waiting for the webhook round-trip;
    // the webhook event that follows will confirm/overwrite this.
    await this.subscriptionsService.syncSubscriptionStatus({
      stripeSubscriptionId: subscription.stripeSubscriptionId,
      status: subscription.status,
      cancelAtPeriodEnd: true,
    });

    return { message: 'Subscription will cancel at the end of the period' };
  }

  async handleStripeEvent(event: Stripe.Event) {
    switch (event.type) {
      case 'checkout.session.completed':
        await this.onCheckoutCompleted(
          event.data.object as Stripe.Checkout.Session,
        );
        break;
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
        await this.onSubscriptionUpdated(
          event.data.object as Stripe.Subscription,
        );
        break;
      case 'invoice.payment_failed':
        await this.onInvoicePaymentFailed(event.data.object as Stripe.Invoice);
        break;
      default:
        this.logger.debug(`Unhandled Stripe event type: ${event.type}`);
    }
    return { received: true };
  }

  private async onCheckoutCompleted(session: Stripe.Checkout.Session) {
    const organizationId = session.metadata?.organizationId;
    const planId = session.metadata?.planId;
    const stripeSubscriptionId = session.subscription;
    const stripeCustomerId = session.customer;

    if (
      !organizationId ||
      !planId ||
      typeof stripeSubscriptionId !== 'string' ||
      typeof stripeCustomerId !== 'string'
    ) {
      this.logger.warn(
        'checkout.session.completed missing expected metadata/ids',
      );
      return;
    }

    await this.subscriptionsService.activateSubscription({
      organizationId,
      planId,
      stripeCustomerId,
      stripeSubscriptionId,
      status: SubscriptionStatus.ACTIVE,
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(),
    });
  }

  private async onSubscriptionUpdated(subscription: Stripe.Subscription) {
    // As of the current Stripe API version, billing-period fields live on
    // each subscription item rather than the subscription itself.
    const firstItem = subscription.items.data[0];

    await this.subscriptionsService.syncSubscriptionStatus({
      stripeSubscriptionId: subscription.id,
      status: STRIPE_STATUS_MAP[subscription.status],
      currentPeriodStart: firstItem
        ? new Date(firstItem.current_period_start * 1000)
        : undefined,
      currentPeriodEnd: firstItem
        ? new Date(firstItem.current_period_end * 1000)
        : undefined,
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
    });
  }

  private async onInvoicePaymentFailed(invoice: Stripe.Invoice) {
    // The subscription reference on an invoice now lives under
    // parent.subscription_details rather than a top-level `subscription`
    // field.
    const subscriptionRef = invoice.parent?.subscription_details?.subscription;
    const stripeSubscriptionId =
      typeof subscriptionRef === 'string'
        ? subscriptionRef
        : subscriptionRef?.id;
    if (!stripeSubscriptionId) return;

    await this.subscriptionsService.syncSubscriptionStatus({
      stripeSubscriptionId,
      status: SubscriptionStatus.PAST_DUE,
    });
  }
}
