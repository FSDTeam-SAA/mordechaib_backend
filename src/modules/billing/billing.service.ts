import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import Stripe from 'stripe';
import { AddonCategory } from '../../common/enums/addon-category.enum';
import { PlanType } from '../../common/enums/plan-type.enum';
import { SubscriptionStatus } from '../../common/enums/subscription-status.enum';
import { AddonProductsService } from '../addons/addon-products.service';
import { InvoicesService } from '../invoices/invoices.service';
import { StripeProvider } from '../stripe/stripe.provider';
import { SubscriptionPlansService } from '../subscriptions/subscription-plans.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { TwilioProvisioningService } from '../twilio/twilio-provisioning.service';
import { AddAddonDto } from './dto/add-addon.dto';
import { CreateCheckoutSessionWithAddonsDto } from './dto/create-checkout-session-with-addons.dto';
import { CreateCheckoutSessionDto } from './dto/create-checkout-session.dto';

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
    private readonly invoicesService: InvoicesService,
    private readonly twilioProvisioning: TwilioProvisioningService,
    private readonly addonProductsService: AddonProductsService,
  ) {}

  // First-time checkout only. An org that already has a subscription
  // upgrades via upgradeSubscription() below instead — a second Checkout
  // Session would create a second, separate Stripe subscription rather
  // than modifying the existing one.
  async createCheckoutSession(
    organizationId: string,
    dto: CreateCheckoutSessionDto,
  ) {
    if (dto.planType === PlanType.CUSTOM) {
      throw new BadRequestException(
        'The Customized plan is inquiry-only — submit a package inquiry instead',
      );
    }

    const existing = await this.subscriptionsService
      .getMine(organizationId)
      .catch(() => null);
    if (existing?.subscription.stripeSubscriptionId) {
      throw new BadRequestException(
        'This organization already has a subscription — use the upgrade endpoint instead of checking out again',
      );
    }

    const plan = await this.plansService.findByPlanType(dto.planType);
    const planPriceId = await this.plansService.ensureCheckoutPrice(
      String(plan._id),
    );

    const session = await this.stripeProvider.createCheckoutSession({
      priceId: planPriceId,
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

  // Checkout with base plan plus optional add-on tiers in a single checkout session
  async createCheckoutSessionWithAddons(
    organizationId: string,
    dto: CreateCheckoutSessionWithAddonsDto,
  ) {
    if (!dto.planId && !dto.planType) {
      throw new BadRequestException(
        'Either planId or planType must be provided',
      );
    }

    const plan = dto.planId
      ? await this.plansService.findById(dto.planId)
      : await this.plansService.findByPlanType(dto.planType!);

    if (plan.planType === PlanType.CUSTOM || plan.isInquiryOnly) {
      throw new BadRequestException(
        'The Customized plan is inquiry-only — submit a package inquiry instead',
      );
    }

    const existing = await this.subscriptionsService
      .getMine(organizationId)
      .catch(() => null);
    if (existing?.subscription.stripeSubscriptionId) {
      throw new BadRequestException(
        'This organization already has a subscription — use the upgrade or addon endpoints instead of checking out again',
      );
    }

    const planPriceId = await this.plansService.ensureCheckoutPrice(
      String(plan._id),
    );

    // Deduplicate any repeated selections (same product and tier)
    const uniqueAddons: { addonProductId: string; tierIndex: number }[] = [];
    const seen = new Set<string>();
    for (const item of dto.addons ?? []) {
      const key = `${item.addonProductId}:${item.tierIndex}`;
      if (!seen.has(key)) {
        seen.add(key);
        uniqueAddons.push(item);
      }
    }

    const addonPriceIds: string[] = [];
    for (const item of uniqueAddons) {
      const priceId = await this.addonProductsService.getTierStripePriceId(
        item.addonProductId,
        item.tierIndex,
      );
      addonPriceIds.push(priceId);
    }

    const session = await this.stripeProvider.createCheckoutSessionWithAddons({
      planPriceId,
      addonPriceIds,
      successUrl: dto.successUrl,
      cancelUrl: dto.cancelUrl,
      trialDays: plan.trialDays,
      metadata: {
        organizationId,
        planId: String(plan._id),
        addonSelections: uniqueAddons.length
          ? JSON.stringify(uniqueAddons)
          : '',
      },
    });

    return { checkoutUrl: session.url };
  }

  // Add or update an add-on tier on an existing subscription
  async addOrUpdateAddon(organizationId: string, dto: AddAddonDto) {
    const { subscription } =
      await this.subscriptionsService.getMine(organizationId);
    if (!subscription.stripeSubscriptionId) {
      throw new BadRequestException('No active Stripe subscription found');
    }

    const addonProduct = await this.addonProductsService.findById(
      dto.addonProductId,
    );
    const tier = addonProduct.tiers[dto.tierIndex];
    if (!tier || !tier.stripePriceId) {
      throw new BadRequestException(
        'Invalid add-on tier or tier has no Stripe price',
      );
    }

    const existingAddon = subscription.activeAddons?.find(
      (a) => a.category === addonProduct.category,
    );

    let stripeSubscriptionItemId: string;

    if (existingAddon?.stripeSubscriptionItemId) {
      const updatedItem = await this.stripeProvider.updateSubscriptionItem(
        existingAddon.stripeSubscriptionItemId,
        tier.stripePriceId,
      );
      stripeSubscriptionItemId = updatedItem.id;
    } else {
      const newItem = await this.stripeProvider.addSubscriptionItem(
        subscription.stripeSubscriptionId,
        tier.stripePriceId,
      );
      stripeSubscriptionItemId = newItem.id;
    }

    await this.subscriptionsService.upsertActiveAddon(organizationId, {
      category: addonProduct.category,
      addonProductId: String((addonProduct as unknown as { _id: unknown })._id),
      tierIndex: dto.tierIndex,
      label: tier.label,
      quantity: tier.quantity,
      priceUsd: tier.priceUsd,
      stripeSubscriptionItemId,
    });

    return { message: 'Add-on updated successfully' };
  }

  // Remove an active add-on from an existing subscription
  async removeAddon(organizationId: string, category: AddonCategory) {
    const { subscription } =
      await this.subscriptionsService.getMine(organizationId);
    if (!subscription.stripeSubscriptionId) {
      throw new BadRequestException('No active Stripe subscription found');
    }

    const existingAddons = subscription.activeAddons?.filter(
      (a) => a.category === category,
    ) || [];
    if (existingAddons.length === 0) {
      throw new NotFoundException(
        `No active add-on found for category ${category}`,
      );
    }

    for (const item of existingAddons) {
      if (item.stripeSubscriptionItemId) {
        await this.stripeProvider.deleteSubscriptionItem(
          item.stripeSubscriptionItemId,
        );
      }
    }

    await this.subscriptionsService.removeActiveAddon(organizationId, category);
    return { message: 'Add-on removed successfully' };
  }

  // Self-service upgrade — "upgrade is easy, anytime" per your spec.
  // Downgrade deliberately has no equivalent here; it always routes
  // through SubscriptionsService.requestDowngrade (a sales lead) instead.
  async upgradeSubscription(organizationId: string, targetPlanType: PlanType) {
    if (targetPlanType === PlanType.CUSTOM) {
      throw new BadRequestException(
        'The Customized plan is inquiry-only — submit a package inquiry instead',
      );
    }

    const { subscription, plan: currentPlan } =
      await this.subscriptionsService.getMine(organizationId);
    if (!subscription.stripeSubscriptionId) {
      throw new BadRequestException('No active Stripe subscription found');
    }

    const targetPlan = await this.plansService.findByPlanType(targetPlanType);
    if (!targetPlan.stripePriceId) {
      throw new BadRequestException(
        'This plan is not yet linked to a Stripe price',
      );
    }

    const currentPriceUsd = currentPlan.priceUsd ?? 0;
    const targetPriceUsd = targetPlan.priceUsd ?? 0;
    if (targetPriceUsd <= currentPriceUsd) {
      throw new BadRequestException(
        'That is not an upgrade — for a lower-cost plan, submit a downgrade request instead',
      );
    }

    await this.stripeProvider.upgradeSubscriptionPrice(
      subscription.stripeSubscriptionId,
      targetPlan.stripePriceId,
    );
    // Optimistic local update — the resulting customer.subscription.updated
    // webhook will confirm status/period, but it has no way to know our
    // internal planId, so we set that here rather than waiting on it.
    await this.subscriptionsService.updatePlanAfterUpgrade(
      organizationId,
      targetPlan,
    );

    return { message: `Upgraded to ${targetPlan.name}` };
  }

  // Screen 3.
  async pauseSubscription(organizationId: string, days: 30 | 60 | 90) {
    const { subscription } =
      await this.subscriptionsService.getMine(organizationId);
    if (!subscription.stripeSubscriptionId) {
      throw new BadRequestException('No active Stripe subscription found');
    }

    const resumesAt = new Date();
    resumesAt.setUTCDate(resumesAt.getUTCDate() + days);

    await this.stripeProvider.pauseSubscription(
      subscription.stripeSubscriptionId,
      resumesAt,
    );
    await this.subscriptionsService.setPause(organizationId, resumesAt);
    await this.twilioProvisioning.suspendForBilling(organizationId);

    return {
      message: `Subscription paused until ${resumesAt.toDateString()}`,
      resumesAt,
    };
  }

  // "Resume anytime with one click."
  async resumeSubscription(organizationId: string) {
    const { subscription } =
      await this.subscriptionsService.getMine(organizationId);
    if (!subscription.stripeSubscriptionId) {
      throw new BadRequestException('No active Stripe subscription found');
    }

    await this.stripeProvider.resumeSubscription(
      subscription.stripeSubscriptionId,
    );
    await this.subscriptionsService.setPause(organizationId, null);
    await this.twilioProvisioning.resumeForBilling(organizationId);

    return { message: 'Subscription resumed' };
  }

  async handleStripeEvent(event: Stripe.Event) {
    switch (event.type) {
      case 'checkout.session.completed':
        await this.onCheckoutCompleted(
          event.data.object as Stripe.Checkout.Session,
        );
        break;
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
        await this.onSubscriptionUpdated(
          event.data.object as Stripe.Subscription,
        );
        break;
      case 'invoice.paid':
      case 'invoice.finalized':
        await this.invoicesService.upsertFromStripeEvent(
          event.data.object as Stripe.Invoice,
        );
        break;
      case 'invoice.payment_failed':
        await this.onInvoicePaymentFailed(event.data.object as Stripe.Invoice);
        await this.invoicesService.upsertFromStripeEvent(
          event.data.object as Stripe.Invoice,
        );
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

    // Stripe does not guarantee webhook delivery order. Retrieve the source
    // of truth immediately so a fast invoice event cannot arrive before the
    // local subscription exists and get skipped.
    try {
      const stripeSubscription =
        await this.stripeProvider.client.subscriptions.retrieve(
          stripeSubscriptionId,
          { expand: ['latest_invoice'] },
        );
      await this.onSubscriptionUpdated(stripeSubscription);

      const latestInvoice = stripeSubscription.latest_invoice;
      if (latestInvoice) {
        const invoice =
          typeof latestInvoice === 'string'
            ? await this.stripeProvider.client.invoices.retrieve(latestInvoice)
            : latestInvoice;
        await this.invoicesService.upsertFromStripeEvent(invoice);
      }
    } catch (error) {
      this.logger.error(
        'Failed to synchronize subscription/invoice after checkout',
        error,
      );
    }

    // If addons were included in the checkout session, link them to the subscription
    if (session.metadata?.addonSelections) {
      try {
        const selections = JSON.parse(
          session.metadata.addonSelections,
        ) as { addonProductId: string; tierIndex: number }[];
        const stripeSub =
          await this.stripeProvider.client.subscriptions.retrieve(
            stripeSubscriptionId,
          );

        for (const item of selections) {
          const addonProduct = await this.addonProductsService.findById(
            item.addonProductId,
          );
          const tier = addonProduct.tiers[item.tierIndex];
          if (tier?.stripePriceId) {
            const subItem = stripeSub.items.data.find(
              (si) => si.price.id === tier.stripePriceId,
            );
            await this.subscriptionsService.upsertActiveAddon(organizationId, {
              category: addonProduct.category,
              addonProductId: String(
                (addonProduct as unknown as { _id: unknown })._id,
              ),
              tierIndex: item.tierIndex,
              label: tier.label,
              quantity: tier.quantity,
              priceUsd: tier.priceUsd,
              stripeSubscriptionItemId: subItem?.id,
            });
          }
        }
      } catch (err) {
        this.logger.error(
          'Failed to sync add-ons from checkout session completed event',
          err,
        );
      }
    }
    // Billing interval isn't known from the checkout session alone (it's
    // not expanded here) — the customer.subscription.created/updated event
    // Stripe fires right after checkout fills it in via onSubscriptionUpdated.
  }

  private async onSubscriptionUpdated(subscription: Stripe.Subscription) {
    // As of the current Stripe API version, billing-period fields live on
    // each subscription item rather than the subscription itself.
    const firstItem = subscription.items.data[0];
    const billingInterval = firstItem?.price?.recurring?.interval;
    const pausedUntil = subscription.pause_collection?.resumes_at
      ? new Date(subscription.pause_collection.resumes_at * 1000)
      : null;

    const localSubscription =
      await this.subscriptionsService.syncSubscriptionStatus({
        stripeSubscriptionId: subscription.id,
        status: STRIPE_STATUS_MAP[subscription.status],
        currentPeriodStart: firstItem
          ? new Date(firstItem.current_period_start * 1000)
          : undefined,
        currentPeriodEnd: firstItem
          ? new Date(firstItem.current_period_end * 1000)
          : undefined,
        billingInterval,
        cancelAtPeriodEnd: subscription.cancel_at_period_end,
        pausedUntil,
      });
    if (!localSubscription) return;
    if (localSubscription.status === SubscriptionStatus.CANCELED) {
      await this.twilioProvisioning.scheduleCancellationClosure(
        localSubscription.organizationId,
      );
    } else if (
      localSubscription.status === SubscriptionStatus.PAST_DUE ||
      (localSubscription.pausedUntil &&
        localSubscription.pausedUntil > new Date())
    ) {
      await this.twilioProvisioning.suspendForBilling(
        localSubscription.organizationId,
      );
    } else if (
      [SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIALING].includes(
        localSubscription.status,
      )
    ) {
      await this.twilioProvisioning.resumeForBilling(
        localSubscription.organizationId,
      );
    }
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

    const localSubscription =
      await this.subscriptionsService.syncSubscriptionStatus({
        stripeSubscriptionId,
        status: SubscriptionStatus.PAST_DUE,
      });
    if (localSubscription) {
      await this.twilioProvisioning.suspendForBilling(
        localSubscription.organizationId,
      );
    }
  }
}
