import { BadRequestException, Injectable } from '@nestjs/common';
import Stripe from 'stripe';
import { AddonCategory } from '../../common/enums/addon-category.enum';
import { resolveUsagePeriod } from '../../common/helpers/usage-period.helper';
import { StripeProvider } from '../stripe/stripe.provider';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { UsageRepository } from '../usage/usage.repository';
import { ReconcileUsageDto } from './dto/reconcile-usage.dto';
import {
  UsageBillingMetricSnapshot,
  UsageBillingRepository,
} from './usage-billing.repository';

type Period = { periodStart: Date; periodEnd: Date };

@Injectable()
export class UsageBillingService {
  constructor(
    private readonly usage: UsageRepository,
    private readonly billingPeriods: UsageBillingRepository,
    private readonly subscriptions: SubscriptionsService,
    private readonly stripe: StripeProvider,
  ) {}

  async summary(organizationId: string, dto: ReconcileUsageDto = {}) {
    const context = await this.context(organizationId, dto);
    const [usage, reconciliation] = await Promise.all([
      this.usage.aggregatePeriod(
        organizationId,
        context.periodStart,
        context.periodEnd,
      ),
      this.billingPeriods.findPeriod(
        organizationId,
        context.periodStart,
        context.periodEnd,
      ),
    ]);
    return this.response(context, usage, reconciliation);
  }

  async reconcile(organizationId: string, dto: ReconcileUsageDto = {}) {
    const context = await this.context(organizationId, dto);
    if (!context.stripeCustomerId) {
      throw new BadRequestException(
        'The subscription has no Stripe customer for usage billing',
      );
    }
    const [rows, billingRows] = await Promise.all([
      this.usage.aggregatePeriod(
        organizationId,
        context.periodStart,
        context.periodEnd,
      ),
      this.usage.aggregateBillingStatuses(
        organizationId,
        context.periodStart,
        context.periodEnd,
      ),
    ]);

    const snapshots = [
      await this.reconcileAiActions(context, rows),
      await this.reconcileProviderManagedMetric(
        context,
        rows,
        billingRows,
        'CALL_MINUTES',
        'TWILIO',
        'CALL_SECONDS',
        'SECOND',
      ),
      await this.reconcileUnavailableMeetingUsage(context, rows),
    ];

    return this.response(context, rows, snapshots);
  }

  async generateInvoice(organizationId: string, dto: ReconcileUsageDto) {
    const context = await this.context(organizationId, dto);
    if (context.periodEnd.getTime() > Date.now()) {
      throw new BadRequestException(
        'A usage invoice can only be generated after the billing period ends',
      );
    }
    if (!context.stripeCustomerId || !context.stripeSubscriptionId) {
      throw new BadRequestException(
        'An active Stripe customer and subscription are required',
      );
    }
    const reconciliation = await this.reconcile(organizationId, dto);
    const billableCents = reconciliation.metrics.reduce(
      (total, metric) =>
        total + Math.round(Number(metric.amountUsd ?? 0) * 100),
      0,
    );
    if (billableCents <= 0) {
      return {
        ...reconciliation,
        invoice: null,
        message: 'No billable measured usage exists for this period',
      };
    }

    const invoice = await this.stripe.createUsageInvoice({
      customerId: context.stripeCustomerId,
      organizationId,
      stripeSubscriptionId: context.stripeSubscriptionId,
      periodStart: context.periodStart,
      periodEnd: context.periodEnd,
      idempotencyKey: this.invoiceKey(context, billableCents),
    });
    await this.billingPeriods.attachInvoice(
      organizationId,
      context.periodStart,
      context.periodEnd,
      invoice.id,
    );
    return {
      ...reconciliation,
      invoice: {
        id: invoice.id,
        status: invoice.status,
        hostedInvoiceUrl: invoice.hosted_invoice_url,
        invoicePdfUrl: invoice.invoice_pdf,
      },
    };
  }

  async markInvoiceState(invoice: Stripe.Invoice, status: 'BILLED' | 'FAILED') {
    if (invoice.metadata?.usageInvoice !== 'true') return;
    const organizationId = invoice.metadata.organizationId;
    const periodStart = new Date(invoice.metadata.periodStart);
    const periodEnd = new Date(invoice.metadata.periodEnd);
    if (
      !organizationId ||
      Number.isNaN(periodStart.getTime()) ||
      Number.isNaN(periodEnd.getTime())
    ) {
      return;
    }
    const rows = await this.billingPeriods.findPeriod(
      organizationId,
      periodStart,
      periodEnd,
    );
    await Promise.all(
      rows.map((row) =>
        this.billingPeriods.upsert({
          ...this.snapshot(row),
          status: row.amountUsd > 0 ? status : 'NOT_REQUIRED',
          stripeInvoiceId: invoice.id,
          billingError:
            status === 'FAILED' ? 'Stripe invoice payment failed' : undefined,
          reconciledAt: new Date(),
        }),
      ),
    );
  }

  private async reconcileAiActions(
    context: Awaited<ReturnType<UsageBillingService['context']>>,
    rows: Awaited<ReturnType<UsageRepository['aggregatePeriod']>>,
  ) {
    const measured = this.quantity(rows, 'AI_BACKEND', 'AI_ACTIONS');
    const included = context.aiActionsIncluded;
    const billable = Math.max(0, measured - included);
    const amountUsd = this.money(billable * context.aiActionRateUsd);
    return this.reconcileStripeMetric(context, {
      metric: 'AI_ACTIONS',
      unit: 'ACTION',
      measuredQuantity: measured,
      includedQuantity: Math.min(measured, included),
      billableQuantity: billable,
      rateUsd: context.aiActionRateUsd,
      amountUsd,
      description: `${billable} AI action overage`,
    });
  }

  private async reconcileStripeMetric(
    context: Awaited<ReturnType<UsageBillingService['context']>>,
    input: {
      metric: string;
      unit: string;
      measuredQuantity: number;
      includedQuantity: number;
      billableQuantity: number;
      rateUsd: number;
      amountUsd: number;
      description: string;
    },
  ) {
    const existing = await this.billingPeriods.findMetric(
      context.organizationId,
      input.metric,
      context.periodStart,
      context.periodEnd,
    );
    const billedAmountUsd = existing?.billedAmountUsd ?? 0;
    const deltaCents = Math.max(
      0,
      Math.round((input.amountUsd - billedAmountUsd) * 100),
    );
    let invoiceItemIds = existing?.stripeInvoiceItemIds ?? [];
    let status: UsageBillingMetricSnapshot['status'] =
      input.amountUsd > 0 ? 'PENDING' : 'NOT_REQUIRED';
    let billingError: string | undefined;

    if (deltaCents > 0) {
      try {
        const item = await this.stripe.createUsageInvoiceItem({
          customerId: context.stripeCustomerId!,
          amountCents: deltaCents,
          organizationId: context.organizationId,
          metric: input.metric,
          periodStart: context.periodStart,
          periodEnd: context.periodEnd,
          description: input.description,
          idempotencyKey: this.itemKey(context, input.metric, input.amountUsd),
        });
        invoiceItemIds = [...new Set([...invoiceItemIds, item.id])];
      } catch (error) {
        status = 'FAILED';
        billingError = (
          error instanceof Error ? error.message : String(error)
        ).slice(0, 500);
      }
    }

    const snapshot: UsageBillingMetricSnapshot = {
      organizationId: context.organizationId,
      metric: input.metric,
      unit: input.unit,
      periodStart: context.periodStart,
      periodEnd: context.periodEnd,
      measuredQuantity: input.measuredQuantity,
      includedQuantity: input.includedQuantity,
      billableQuantity: input.billableQuantity,
      rateUsd: input.rateUsd,
      amountUsd: input.amountUsd,
      billedAmountUsd: status === 'FAILED' ? billedAmountUsd : input.amountUsd,
      stripeInvoiceItemIds: invoiceItemIds,
      status,
      billingError,
      reconciledAt: new Date(),
    };
    return this.billingPeriods.upsert(snapshot);
  }

  private async reconcileProviderManagedMetric(
    context: Awaited<ReturnType<UsageBillingService['context']>>,
    rows: Awaited<ReturnType<UsageRepository['aggregatePeriod']>>,
    billingRows: Awaited<
      ReturnType<UsageRepository['aggregateBillingStatuses']>
    >,
    metric: string,
    provider: string,
    sourceMetric: string,
    unit: string,
  ) {
    const measured = this.quantity(rows, provider, sourceMetric);
    const providerRows = billingRows.filter(
      (row) => row.provider === provider && row.metric === sourceMetric,
    );
    const amountUsd = this.money(
      providerRows.reduce((sum, row) => sum + row.costUsd, 0),
    );
    const billedAmountUsd = this.money(
      providerRows
        .filter((row) => row.billingStatus === 'BILLED')
        .reduce((sum, row) => sum + row.costUsd, 0),
    );
    const failed = providerRows.some((row) => row.billingStatus === 'FAILED');
    const pending = providerRows.some((row) => row.billingStatus === 'PENDING');
    return this.billingPeriods.upsert({
      organizationId: context.organizationId,
      metric,
      unit,
      periodStart: context.periodStart,
      periodEnd: context.periodEnd,
      measuredQuantity: measured,
      includedQuantity: Math.max(0, measured - this.overage(providerRows)),
      billableQuantity: this.overage(providerRows),
      rateUsd: context.callMinuteRateUsd,
      amountUsd,
      billedAmountUsd,
      stripeInvoiceItemIds: [],
      status: failed
        ? 'FAILED'
        : pending
          ? 'PENDING'
          : amountUsd > 0
            ? 'BILLED'
            : 'NOT_REQUIRED',
      reconciledAt: new Date(),
    });
  }

  private reconcileUnavailableMeetingUsage(
    context: Awaited<ReturnType<UsageBillingService['context']>>,
    rows: Awaited<ReturnType<UsageRepository['aggregatePeriod']>>,
  ) {
    const measured = this.quantity(rows, 'RECALL', 'MEETING_CAPTURE_SECONDS');
    return this.billingPeriods.upsert({
      organizationId: context.organizationId,
      metric: 'MEETING_CAPTURE_HOURS',
      unit: 'SECOND',
      periodStart: context.periodStart,
      periodEnd: context.periodEnd,
      measuredQuantity: measured,
      includedQuantity: measured,
      billableQuantity: 0,
      rateUsd: 0,
      amountUsd: 0,
      billedAmountUsd: 0,
      stripeInvoiceItemIds: [],
      status: 'NOT_REQUIRED',
      billingError:
        measured > 0 ? undefined : 'AUTHORITATIVE_RECALL_DURATION_NOT_RECORDED',
      reconciledAt: new Date(),
    });
  }

  private async context(organizationId: string, dto: ReconcileUsageDto) {
    const { subscription } = await this.subscriptions.getMine(organizationId);
    const period = this.period(subscription, dto);
    const aiActionsIncluded = this.limitWithAddons(
      subscription.snapshotLimits?.aiActionsPerMonth,
      subscription.activeAddons,
      AddonCategory.AI_ACTIONS,
    );
    return {
      organizationId,
      ...period,
      stripeCustomerId: subscription.stripeCustomerId,
      stripeSubscriptionId: subscription.stripeSubscriptionId,
      aiActionsIncluded,
      aiActionRateUsd: subscription.snapshotLimits?.extraAiActionPriceUsd ?? 0,
      callMinuteRateUsd:
        subscription.snapshotLimits?.extraCallMinutePriceUsd ?? 0,
    };
  }

  private period(
    subscription: {
      currentPeriodStart?: Date;
      currentPeriodEnd?: Date;
      billingInterval?: string;
    },
    dto: ReconcileUsageDto,
  ): Period {
    if (!!dto.periodStart !== !!dto.periodEnd) {
      throw new BadRequestException(
        'periodStart and periodEnd must be supplied together',
      );
    }
    if (dto.periodStart && dto.periodEnd) {
      const periodStart = new Date(dto.periodStart);
      const periodEnd = new Date(dto.periodEnd);
      if (periodStart >= periodEnd) {
        throw new BadRequestException('periodStart must be before periodEnd');
      }
      const durationDays =
        (periodEnd.getTime() - periodStart.getTime()) / 86_400_000;
      if (durationDays > 32) {
        throw new BadRequestException(
          'Usage reconciliation periods cannot exceed 32 days',
        );
      }
      return { periodStart, periodEnd };
    }
    return resolveUsagePeriod(subscription);
  }

  private response(
    context: Period & { organizationId: string },
    usage: Awaited<ReturnType<UsageRepository['aggregatePeriod']>>,
    reconciliation: Array<Record<string, unknown>>,
  ) {
    return {
      organizationId: context.organizationId,
      currency: 'USD',
      period: { start: context.periodStart, end: context.periodEnd },
      measuredUsage: usage,
      metrics: reconciliation.map((row) => ({
        metric: row.metric,
        unit: row.unit,
        measuredQuantity: row.measuredQuantity,
        includedQuantity: row.includedQuantity,
        billableQuantity: row.billableQuantity,
        rateUsd: row.rateUsd,
        amountUsd: row.amountUsd,
        billedAmountUsd: row.billedAmountUsd,
        status: row.status,
        availability:
          row.billingError === 'AUTHORITATIVE_RECALL_DURATION_NOT_RECORDED'
            ? 'UNAVAILABLE'
            : 'AVAILABLE',
        reason: row.billingError,
      })),
      totals: {
        measuredCostUsd: this.money(
          usage.reduce((sum, row) => sum + row.costUsd, 0),
        ),
        customerUsageChargeUsd: this.money(
          reconciliation.reduce(
            (sum, row) => sum + Number(row.amountUsd ?? 0),
            0,
          ),
        ),
      },
    };
  }

  private quantity(
    rows: Array<{ provider: string; metric: string; quantity: number }>,
    provider: string,
    metric: string,
  ) {
    return (
      rows.find((row) => row.provider === provider && row.metric === metric)
        ?.quantity ?? 0
    );
  }

  private overage(rows: Array<{ overageQuantity: number }>) {
    return rows.reduce((sum, row) => sum + row.overageQuantity, 0);
  }

  private limitWithAddons(
    base: number | undefined,
    addons: Array<{ category: AddonCategory; quantity: number }> | undefined,
    category: AddonCategory,
  ) {
    return (
      (base ?? 0) +
      (addons ?? [])
        .filter((addon) => addon.category === category)
        .reduce((total, addon) => total + addon.quantity, 0)
    );
  }

  private money(value: number) {
    return Number(value.toFixed(2));
  }

  private itemKey(
    context: Period & { organizationId: string },
    metric: string,
    cumulativeAmountUsd: number,
  ) {
    return `usage-${context.organizationId}-${metric}-${context.periodStart.getTime()}-${Math.round(cumulativeAmountUsd * 100)}`;
  }

  private invoiceKey(
    context: Period & { organizationId: string },
    cumulativeAmountCents: number,
  ) {
    return `usage-invoice-${context.organizationId}-${context.periodStart.getTime()}-${context.periodEnd.getTime()}-${cumulativeAmountCents}`;
  }

  private snapshot(row: Record<string, unknown>): UsageBillingMetricSnapshot {
    return row as UsageBillingMetricSnapshot;
  }
}
