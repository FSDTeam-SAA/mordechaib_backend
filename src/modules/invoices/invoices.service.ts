import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import Stripe from 'stripe';
import { InvoiceStatus } from '../../common/enums/invoice-status.enum';
import { OrganizationsService } from '../organizations/organizations.service';
import { SubscriptionPlansService } from '../subscriptions/subscription-plans.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { ListInvoicesQueryDto } from './dto/list-invoices-query.dto';
import { InvoicesRepository } from './invoices.repository';

const STRIPE_INVOICE_STATUS_MAP: Record<string, InvoiceStatus> = {
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

    return { items, page, limit, total, totalPages: Math.ceil(total / limit) };
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