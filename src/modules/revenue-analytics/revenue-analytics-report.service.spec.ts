import {
  RevenueAcquisitionChannel,
  RevenueAnalyticsAvailability,
  RevenueAnalyticsCurrency,
  RevenueAnalyticsMeasurementBasis,
  RevenueAnalyticsMetricKey,
  RevenueServiceProvider,
} from './revenue-analytics.enums';
import { RevenueAnalyticsReportService } from './revenue-analytics-report.service';
import { RevenueRetentionResponse } from './revenue-retention.types';
import { RevenueUnitEconomicsResponse } from './revenue-unit-economics.types';

describe('RevenueAnalyticsReportService', () => {
  const service = new RevenueAnalyticsReportService();

  it('creates a deterministic PDF filename and preserves disclosures', async () => {
    const report = await service.create(retention(), unitEconomics());

    expect(report.buffer.subarray(0, 4).toString()).toBe('%PDF');
    expect(report.buffer.length).toBeGreaterThan(1_000);
    expect(report.filename).toBe(
      'noltra-revenue-analytics-2026-11-01-to-2026-12-01.pdf',
    );
    expect(report.hasEstimatedData).toBe(true);
    expect(new Date(report.generatedAt).toISOString()).toBe(report.generatedAt);
  });

  it('does not mark a fully measured report as estimated', async () => {
    const measuredRetention = retention();
    measuredRetention.summary.forEach((metric) => (metric.isEstimated = false));
    measuredRetention.lifetimeValueByPlan.forEach(
      (plan) => (plan.isEstimated = false),
    );
    const measuredEconomics = unitEconomics();
    measuredEconomics.summary.forEach((metric) => (metric.isEstimated = false));
    measuredEconomics.providerCosts.forEach(
      (provider) => (provider.isEstimated = false),
    );

    const report = await service.create(measuredRetention, measuredEconomics);

    expect(report.hasEstimatedData).toBe(false);
  });
});

function retention(): RevenueRetentionResponse {
  return {
    schemaVersion: '1.0',
    methodologyVersion: '1.0',
    currency: RevenueAnalyticsCurrency.USD,
    from: '2026-11-01T00:00:00.000Z',
    to: '2026-12-01T00:00:00.000Z',
    timezone: 'UTC',
    generatedAt: '2026-12-01T00:00:01.000Z',
    summary: [
      {
        key: RevenueAnalyticsMetricKey.LOGO_CHURN_RATE,
        label: 'Monthly logo churn rate',
        value: 2.5,
        unit: 'PERCENT',
        availability: RevenueAnalyticsAvailability.AVAILABLE,
        basis: RevenueAnalyticsMeasurementBasis.DERIVED,
        isEstimated: false,
      },
      {
        key: RevenueAnalyticsMetricKey.REALIZED_LTV,
        label: 'Realized LTV',
        value: 500,
        unit: 'CURRENCY_USD',
        availability: RevenueAnalyticsAvailability.PARTIAL,
        basis: RevenueAnalyticsMeasurementBasis.DERIVED,
        isEstimated: true,
      },
    ],
    trend: [],
    lifetimeValueByPlan: [
      {
        planId: 'growth',
        planName: 'Growth',
        organizationsWithPaidInvoices: 2,
        paidInvoices: 4,
        realizedRevenueUsd: 1_000,
        averageRealizedLtvUsd: 500,
        availability: RevenueAnalyticsAvailability.AVAILABLE,
        isEstimated: false,
      },
    ],
    cohorts: [],
    coverage: {
      expectedOpeningOrganizations: 4,
      snapshottedOpeningOrganizations: 4,
      movements: 2,
      paidInvoiceOrganizations: 2,
      trackingStartedAt: '2026-01-01T00:00:00.000Z',
    },
  };
}

function unitEconomics(): RevenueUnitEconomicsResponse {
  return {
    schemaVersion: '1.0',
    methodologyVersion: '1.0',
    currency: RevenueAnalyticsCurrency.USD,
    from: '2026-11-01T00:00:00.000Z',
    to: '2026-12-01T00:00:00.000Z',
    timezone: 'UTC',
    generatedAt: '2026-12-01T00:00:02.000Z',
    revenueUsd: 2_000,
    summary: [
      {
        key: RevenueAnalyticsMetricKey.GROSS_MARGIN,
        label: 'Gross margin',
        value: 75,
        unit: 'PERCENT',
        availability: RevenueAnalyticsAvailability.PARTIAL,
        basis: RevenueAnalyticsMeasurementBasis.ESTIMATED,
        isEstimated: true,
      },
      {
        key: RevenueAnalyticsMetricKey.LTV_CAC_RATIO,
        label: 'LTV / CAC ratio',
        value: 4.5,
        unit: 'RATIO',
        availability: RevenueAnalyticsAvailability.AVAILABLE,
        basis: RevenueAnalyticsMeasurementBasis.DERIVED,
        isEstimated: false,
      },
    ],
    providerCosts: [
      {
        provider: RevenueServiceProvider.AI,
        eventCount: 10,
        costAvailableEvents: 10,
        costUsd: 50,
        availability: RevenueAnalyticsAvailability.AVAILABLE,
        isEstimated: true,
      },
      {
        provider: RevenueServiceProvider.TWILIO,
        eventCount: 0,
        costAvailableEvents: 0,
        costUsd: null,
        availability: RevenueAnalyticsAvailability.UNAVAILABLE,
        isEstimated: false,
      },
    ],
    acquisitionCosts: {
      salesCostUsd: 100,
      marketingCostUsd: 200,
      totalCostUsd: 300,
      newlyAcquiredOrganizations: 3,
      coveredMonths: 1,
      expectedMonths: 1,
      availability: RevenueAnalyticsAvailability.AVAILABLE,
      channels: [
        {
          channel: RevenueAcquisitionChannel.PAID_SEARCH,
          salesCostUsd: 0,
          marketingCostUsd: 200,
          totalCostUsd: 200,
        },
      ],
    },
    trend: [],
    coverage: {
      totalCostEvents: 10,
      costAvailableEvents: 10,
      estimatedCostEvents: 10,
      activeOrganizations: 4,
    },
  };
}
