import { BadRequestException, Injectable } from '@nestjs/common';
import {
  REVENUE_ANALYTICS_CURRENCY,
  REVENUE_ANALYTICS_MAX_RANGE_DAYS,
  REVENUE_ANALYTICS_METHODOLOGY_VERSION,
  REVENUE_ANALYTICS_SCHEMA_VERSION,
} from './revenue-analytics.constants';
import { RevenueUnitEconomicsQueryDto } from './dto/revenue-unit-economics-query.dto';
import {
  RevenueAnalyticsAvailability,
  RevenueAnalyticsMeasurementBasis,
  RevenueAnalyticsMetricKey,
  RevenueServiceProvider,
} from './revenue-analytics.enums';
import { RevenueCostReconciliationService } from './revenue-cost-reconciliation.service';
import { RevenueCostRepository } from './revenue-cost.repository';
import {
  RevenueCostAggregateRecord,
  RevenueCostTrendRecord,
} from './revenue-cost.types';
import { RevenueLifecycleRepository } from './revenue-lifecycle.repository';
import {
  RevenueProviderCostResponse,
  RevenueUnitEconomicsMetricResponse,
  RevenueUnitEconomicsResponse,
  RevenueUnitEconomicsTrendPointResponse,
} from './revenue-unit-economics.types';
import { RevenueAcquisitionCostService } from './revenue-acquisition-cost.service';

const DAY_MS = 24 * 60 * 60_000;
const PROVIDERS = Object.values(RevenueServiceProvider);

@Injectable()
export class RevenueUnitEconomicsService {
  constructor(
    private readonly costs: RevenueCostRepository,
    private readonly lifecycle: RevenueLifecycleRepository,
    private readonly reconciliation: RevenueCostReconciliationService,
    private readonly acquisitionCosts: RevenueAcquisitionCostService,
  ) {}

  async getUnitEconomics(
    query: RevenueUnitEconomicsQueryDto,
  ): Promise<RevenueUnitEconomicsResponse> {
    this.assertRange(query.from, query.to);
    await this.reconciliation.reconcile();

    const [
      aggregates,
      trendCosts,
      revenueUsd,
      revenueTrend,
      snapshots,
      acquiredOrganizations,
      lifetimeInvoices,
    ] = await Promise.all([
      this.costs.aggregateCosts(query.from, query.to),
      this.costs.aggregateCostTrend(query.from, query.to, query.timezone),
      this.costs.paidRevenue(query.from, query.to),
      this.costs.paidRevenueTrend(query.from, query.to, query.timezone),
      this.lifecycle.findOpeningSnapshots(query.to),
      this.lifecycle.findCohortOrganizations(query.from, query.to),
      this.lifecycle.findLifetimePaidRevenue(query.to),
    ]);
    const activeOrganizations = snapshots.filter(
      (snapshot) => snapshot.revenueActive,
    ).length;
    const providerCosts = PROVIDERS.map((provider) =>
      this.providerCost(
        provider,
        aggregates.find((row) => row.provider === provider),
      ),
    );
    const total = this.total(providerCosts);
    const ai = providerCosts.find(
      (item) => item.provider === RevenueServiceProvider.AI,
    )!;
    const acquisition = await this.acquisitionCosts.analytics(
      query.from,
      query.to,
      query.timezone,
      acquiredOrganizations.length,
    );
    const cac =
      acquisition.availability !== RevenueAnalyticsAvailability.UNAVAILABLE &&
      acquiredOrganizations.length > 0
        ? this.money(acquisition.totalCostUsd / acquiredOrganizations.length)
        : null;
    const realizedLtv =
      lifetimeInvoices.length > 0
        ? this.money(
            lifetimeInvoices.reduce(
              (sum, invoice) => sum + invoice.paidRevenueUsd,
              0,
            ) / lifetimeInvoices.length,
          )
        : null;
    const rangeMonths =
      (query.to.getTime() - query.from.getTime()) / (365.25 / 12) / DAY_MS;
    const grossProfit =
      total.costUsd === null ? null : revenueUsd - total.costUsd;
    const monthlyGrossProfitPerOrganization =
      grossProfit !== null &&
      grossProfit > 0 &&
      activeOrganizations > 0 &&
      rangeMonths > 0
        ? grossProfit / rangeMonths / activeOrganizations
        : null;
    const cacAvailability =
      cac === null
        ? RevenueAnalyticsAvailability.UNAVAILABLE
        : acquisition.availability;
    const paybackAvailability = this.combineAvailability(
      cacAvailability,
      total.availability,
    );

    return {
      schemaVersion: REVENUE_ANALYTICS_SCHEMA_VERSION,
      methodologyVersion: REVENUE_ANALYTICS_METHODOLOGY_VERSION,
      currency: REVENUE_ANALYTICS_CURRENCY,
      from: query.from.toISOString(),
      to: query.to.toISOString(),
      timezone: query.timezone,
      generatedAt: new Date().toISOString(),
      revenueUsd: this.money(revenueUsd),
      summary: [
        this.metric(
          RevenueAnalyticsMetricKey.GROSS_MARGIN,
          'Gross margin',
          revenueUsd > 0 && total.costUsd !== null
            ? this.percentage(revenueUsd - total.costUsd, revenueUsd)
            : null,
          'PERCENT',
          revenueUsd > 0
            ? total.availability
            : RevenueAnalyticsAvailability.UNAVAILABLE,
          RevenueAnalyticsMeasurementBasis.DERIVED,
          total.isEstimated,
          revenueUsd <= 0
            ? 'Gross margin requires paid revenue in the selected period.'
            : undefined,
        ),
        this.metric(
          RevenueAnalyticsMetricKey.COST_PER_AI_TASK,
          'Cost per AI task',
          ai.costUsd !== null && ai.eventCount > 0
            ? this.money(ai.costUsd / ai.eventCount)
            : null,
          'CURRENCY_USD',
          ai.availability,
          RevenueAnalyticsMeasurementBasis.DERIVED,
          ai.isEstimated,
        ),
        this.metric(
          RevenueAnalyticsMetricKey.COST_PER_ORGANIZATION,
          'Cost per active organization',
          total.costUsd !== null && activeOrganizations > 0
            ? this.money(total.costUsd / activeOrganizations)
            : null,
          'CURRENCY_USD',
          activeOrganizations > 0
            ? total.availability
            : RevenueAnalyticsAvailability.UNAVAILABLE,
          RevenueAnalyticsMeasurementBasis.DERIVED,
          total.isEstimated,
        ),
        this.metric(
          RevenueAnalyticsMetricKey.CUSTOMER_ACQUISITION_COST,
          'Customer acquisition cost',
          cac,
          'CURRENCY_USD',
          cacAvailability,
          RevenueAnalyticsMeasurementBasis.DERIVED,
          false,
          acquiredOrganizations.length === 0
            ? 'CAC requires at least one newly acquired organization in the selected period.'
            : acquisition.availability === RevenueAnalyticsAvailability.PARTIAL
              ? 'CAC uses the available monthly acquisition cost entries; some months are missing.'
              : undefined,
        ),
        this.metric(
          RevenueAnalyticsMetricKey.LTV_CAC_RATIO,
          'Realized LTV to CAC ratio',
          realizedLtv !== null && cac !== null && cac > 0
            ? this.money(realizedLtv / cac)
            : null,
          'RATIO',
          realizedLtv !== null && cac !== null && cac > 0
            ? RevenueAnalyticsAvailability.PARTIAL
            : RevenueAnalyticsAvailability.UNAVAILABLE,
          RevenueAnalyticsMeasurementBasis.DERIVED,
          false,
          'LTV is based on locally retained paid-invoice history and is therefore reported as partial.',
        ),
        this.metric(
          RevenueAnalyticsMetricKey.CAC_PAYBACK_PERIOD,
          'CAC payback period',
          cac !== null && monthlyGrossProfitPerOrganization !== null
            ? this.money(cac / monthlyGrossProfitPerOrganization)
            : null,
          'MONTH',
          paybackAvailability,
          RevenueAnalyticsMeasurementBasis.DERIVED,
          total.isEstimated,
          monthlyGrossProfitPerOrganization === null
            ? 'Payback requires CAC and positive monthly gross profit per active organization.'
            : undefined,
        ),
      ],
      providerCosts,
      acquisitionCosts: acquisition,
      trend: this.trend(trendCosts, revenueTrend),
      coverage: {
        totalCostEvents: providerCosts.reduce(
          (sum, provider) => sum + provider.eventCount,
          0,
        ),
        costAvailableEvents: providerCosts.reduce(
          (sum, provider) => sum + provider.costAvailableEvents,
          0,
        ),
        estimatedCostEvents: aggregates.reduce(
          (sum, provider) => sum + provider.estimatedEvents,
          0,
        ),
        activeOrganizations,
      },
    };
  }

  private providerCost(
    provider: RevenueServiceProvider,
    aggregate?: RevenueCostAggregateRecord,
  ): RevenueProviderCostResponse {
    const eventCount = aggregate?.eventCount ?? 0;
    const available = aggregate?.costAvailableEvents ?? 0;
    const availability = this.coverage(eventCount, available);
    return {
      provider,
      eventCount,
      costAvailableEvents: available,
      costUsd:
        availability === RevenueAnalyticsAvailability.UNAVAILABLE
          ? null
          : this.money(aggregate?.costUsd ?? 0),
      availability,
      isEstimated: (aggregate?.estimatedEvents ?? 0) > 0,
    };
  }

  private total(providers: RevenueProviderCostResponse[]) {
    const withEvents = providers.filter((provider) => provider.eventCount > 0);
    const withCost = withEvents.filter((provider) => provider.costUsd !== null);
    const eventCount = withEvents.reduce(
      (sum, provider) => sum + provider.eventCount,
      0,
    );
    const costAvailableEvents = withEvents.reduce(
      (sum, provider) => sum + provider.costAvailableEvents,
      0,
    );
    return {
      costUsd:
        withCost.length === 0
          ? null
          : this.money(
              withCost.reduce((sum, provider) => sum + provider.costUsd!, 0),
            ),
      availability: this.coverage(eventCount, costAvailableEvents),
      isEstimated: withCost.some((provider) => provider.isEstimated),
    };
  }

  private trend(
    costRows: RevenueCostTrendRecord[],
    revenueRows: Array<{ period: string; revenueUsd: number }>,
  ): RevenueUnitEconomicsTrendPointResponse[] {
    const periods = new Set([
      ...costRows.map((row) => row.period),
      ...revenueRows.map((row) => row.period),
    ]);
    return [...periods].sort().map((period) => {
      const providers = PROVIDERS.map((provider) =>
        this.providerCost(
          provider,
          costRows.find(
            (row) => row.period === period && row.provider === provider,
          ),
        ),
      );
      const total = this.total(providers);
      const revenueUsd = this.money(
        revenueRows.find((row) => row.period === period)?.revenueUsd ?? 0,
      );
      return {
        period,
        revenueUsd,
        serviceCostUsd: total.costUsd,
        grossMarginPercent:
          revenueUsd > 0 && total.costUsd !== null
            ? this.percentage(revenueUsd - total.costUsd, revenueUsd)
            : null,
        availability:
          revenueUsd > 0
            ? total.availability
            : RevenueAnalyticsAvailability.UNAVAILABLE,
        isEstimated: total.isEstimated,
        providers,
      };
    });
  }

  private metric(
    key: RevenueAnalyticsMetricKey,
    label: string,
    value: number | null,
    unit: RevenueUnitEconomicsMetricResponse['unit'],
    availability: RevenueAnalyticsAvailability,
    basis: RevenueAnalyticsMeasurementBasis,
    isEstimated: boolean,
    note?: string,
  ): RevenueUnitEconomicsMetricResponse {
    return {
      key,
      label,
      value,
      unit,
      availability:
        value === null
          ? RevenueAnalyticsAvailability.UNAVAILABLE
          : availability,
      basis,
      isEstimated,
      note,
    };
  }

  private coverage(total: number, available: number) {
    if (total <= 0 || available <= 0) {
      return RevenueAnalyticsAvailability.UNAVAILABLE;
    }
    return available >= total
      ? RevenueAnalyticsAvailability.AVAILABLE
      : RevenueAnalyticsAvailability.PARTIAL;
  }

  private combineAvailability(
    first: RevenueAnalyticsAvailability,
    second: RevenueAnalyticsAvailability,
  ) {
    if (
      first === RevenueAnalyticsAvailability.UNAVAILABLE ||
      second === RevenueAnalyticsAvailability.UNAVAILABLE
    ) {
      return RevenueAnalyticsAvailability.UNAVAILABLE;
    }
    return first === RevenueAnalyticsAvailability.PARTIAL ||
      second === RevenueAnalyticsAvailability.PARTIAL
      ? RevenueAnalyticsAvailability.PARTIAL
      : RevenueAnalyticsAvailability.AVAILABLE;
  }

  private percentage(numerator: number, denominator: number) {
    return denominator > 0 ? this.money((numerator / denominator) * 100) : null;
  }

  private money(value: number) {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }

  private assertRange(from: Date, to: Date) {
    if (from >= to) throw new BadRequestException('from must be before to');
    if (
      to.getTime() - from.getTime() >
      REVENUE_ANALYTICS_MAX_RANGE_DAYS * DAY_MS
    ) {
      throw new BadRequestException(
        `Revenue analytics range cannot exceed ${REVENUE_ANALYTICS_MAX_RANGE_DAYS} days`,
      );
    }
  }
}
