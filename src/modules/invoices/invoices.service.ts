import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import Stripe from 'stripe';
import { InvoiceStatus } from '../../common/enums/invoice-status.enum';
import { SubscriptionStatus } from '../../common/enums/subscription-status.enum';
import { OrganizationsService } from '../organizations/organizations.service';
import { SubscriptionPlansService } from '../subscriptions/subscription-plans.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { StripeProvider } from '../stripe/stripe.provider';
import { ListInvoicesQueryDto } from './dto/list-invoices-query.dto';
import { InvoicesRepository } from './invoices.repository';

const STRIPE_INVOICE_STATUS_MAP: Record<NonNullable<Stripe.Invoice.Status>, InvoiceStatus> = {
  draft: InvoiceStatus.DRAFT,
  open: InvoiceStatus.OPEN,
  paid: InvoiceStatus.PAID,
  uncollectible: InvoiceStatus.UNCOLLECTIBLE,
  void: InvoiceStatus.VOID,
};

@Injectable()
export class InvoicesService {
  private readonly logger = new Logger(InvoicesService.name);

  constructor(
    private readonly repository: InvoicesRepository,
    private readonly subscriptionsService: SubscriptionsService,
    private readonly plansService: SubscriptionPlansService,
    private readonly organizationsService: OrganizationsService,
    private readonly stripeProvider: StripeProvider,
  ) {}

  async listForAdmin(query: ListInvoicesQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 9;
    const { items, total } = await this.repository.list({
      search: query.search,
      planType: query.planType,
      status: query.status,
      page,
      limit,
    });

    return {
      items: items.map((item) => ({
        ...item,
        id: String(item._id),
        invoiceId: item.invoiceNumber ?? item.stripeInvoiceId,
      })),
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getById(id: string) {
    const invoice = await this.repository.findById(id);
    if (!invoice) throw new NotFoundException('Invoice not found');
    return {
      ...invoice,
      id: String(invoice._id),
      invoiceId: invoice.invoiceNumber ?? invoice.stripeInvoiceId,
    };
  }

  async getDownloadRedirect(id: string) {
    const invoice = await this.repository.findById(id);
    if (!invoice) throw new NotFoundException('Invoice not found');
    if (!invoice.invoicePdfUrl) {
      throw new NotFoundException('Invoice PDF is not available');
    }
    return { url: invoice.invoicePdfUrl, statusCode: 302 };
  }

  async syncForSubscription(subscriptionId: string) {
    const subscription = await this.subscriptionsService.findById(subscriptionId);
    if (!subscription) throw new NotFoundException('Subscription not found');
    if (!subscription.stripeSubscriptionId) {
      throw new BadRequestException('Subscription has no Stripe subscription ID');
    }

    const stripeSubscription =
      await this.stripeProvider.client.subscriptions.retrieve(
        subscription.stripeSubscriptionId,
        { expand: ['latest_invoice'] },
      );
    const firstItem = stripeSubscription.items.data[0];
    const statusMap: Record<Stripe.Subscription.Status, SubscriptionStatus> = {
      trialing: SubscriptionStatus.TRIALING,
      active: SubscriptionStatus.ACTIVE,
      past_due: SubscriptionStatus.PAST_DUE,
      unpaid: SubscriptionStatus.PAST_DUE,
      canceled: SubscriptionStatus.CANCELED,
      incomplete: SubscriptionStatus.INCOMPLETE,
      incomplete_expired: SubscriptionStatus.CANCELED,
      paused: SubscriptionStatus.CANCELED,
    };
    await this.subscriptionsService.syncSubscriptionStatus({
      stripeSubscriptionId: stripeSubscription.id,
      status: statusMap[stripeSubscription.status],
      currentPeriodStart: firstItem
        ? new Date(firstItem.current_period_start * 1000)
        : undefined,
      currentPeriodEnd: firstItem
        ? new Date(firstItem.current_period_end * 1000)
        : undefined,
      billingInterval: firstItem?.price.recurring?.interval,
      cancelAtPeriodEnd: stripeSubscription.cancel_at_period_end,
      pausedUntil: stripeSubscription.pause_collection?.resumes_at
        ? new Date(stripeSubscription.pause_collection.resumes_at * 1000)
        : null,
    });

    const latestInvoice = stripeSubscription.latest_invoice;
    if (!latestInvoice) {
      return {
        subscriptionId,
        invoice: null,
        message: 'Stripe has not generated an invoice for this subscription yet',
      };
    }
    const stripeInvoice =
      typeof latestInvoice === 'string'
        ? await this.stripeProvider.client.invoices.retrieve(latestInvoice)
        : latestInvoice;
    await this.upsertFromStripeEvent(stripeInvoice);
    const invoice = await this.repository.findByStripeInvoiceId(stripeInvoice.id);
    return { subscriptionId, invoice };
  }

  async delete(id: string) {
    const deleted = await this.repository.deleteById(id);
    if (!deleted) throw new NotFoundException('Invoice not found');
    return { message: 'Invoice record removed' };
  }

  async upsertFromStripeEvent(stripeInvoice: Stripe.Invoice) {
    const subscriptionRef =
      stripeInvoice.parent?.subscription_details?.subscription;
    const stripeSubscriptionId =
      typeof subscriptionRef === 'string'
        ? subscriptionRef
        : subscriptionRef?.id;
    if (!stripeSubscriptionId) {
      this.logger.warn('Invoice event has no linked subscription — skipped');
      return;
    }

    const subscription = await this.subscriptionsService
      .findByStripeSubscriptionId(stripeSubscriptionId)
      .catch(() => null);
    if (!subscription) {
      this.logger.warn(
        `No local subscription found for Stripe subscription ${stripeSubscriptionId}`,
      );
      return;
    }

    const [organization, plan] = await Promise.all([
      this.organizationsService.findCurrent(subscription.organizationId),
      this.plansService.findById(subscription.planId).catch(() => null),
    ]);

    const status = stripeInvoice.status
      ? STRIPE_INVOICE_STATUS_MAP[stripeInvoice.status]
      : InvoiceStatus.OPEN;

    await this.repository.upsertByStripeInvoiceId({
      stripeInvoiceId: stripeInvoice.id!,
      stripeSubscriptionId,
      invoiceNumber: stripeInvoice.number ?? undefined,
      organizationId: subscription.organizationId,
      organizationName: organization.name,
      planId: plan ? String(plan._id) : undefined,
      planType: plan?.planType,
      planName: plan?.name,
      amountUsd: stripeInvoice.amount_paid
        ? stripeInvoice.amount_paid / 100
        : stripeInvoice.amount_due / 100,
      billingInterval: subscription.billingInterval,
      status,
      hostedInvoiceUrl: stripeInvoice.hosted_invoice_url ?? undefined,
      invoicePdfUrl: stripeInvoice.invoice_pdf ?? undefined,
      periodStart: new Date(stripeInvoice.period_start * 1000),
      periodEnd: new Date(stripeInvoice.period_end * 1000),
      issuedAt: new Date(stripeInvoice.created * 1000),
    });
  }
}
