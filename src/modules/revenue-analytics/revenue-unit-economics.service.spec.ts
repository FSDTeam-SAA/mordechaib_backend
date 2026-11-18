import {
  RevenueAnalyticsAvailability,
  RevenueAnalyticsMetricKey,
  RevenueServiceProvider,
} from './revenue-analytics.enums';
import { RevenueCostReconciliationService } from './revenue-cost-reconciliation.service';
import { RevenueCostRepository } from './revenue-cost.repository';
import { RevenueLifecycleRepository } from './revenue-lifecycle.repository';
import { RevenueUnitEconomicsService } from './revenue-unit-economics.service';
import { RevenueAcquisitionCostService } from './revenue-acquisition-cost.service';

describe('RevenueUnitEconomicsService', () => {
  it('calculates covered costs while preserving partial provider coverage', async () => {
    const costs = {
      aggregateCosts: jest.fn().mockResolvedValue([
        {
          provider: RevenueServiceProvider.AI,
          eventCount: 2,
          quantity: 2,
          costUsd: 4,
          costAvailableEvents: 2,
          estimatedEvents: 0,
        },
        {
          provider: RevenueServiceProvider.TWILIO,
          eventCount: 2,
          quantity: 120,
          costUsd: 3,
          costAvailableEvents: 1,
          estimatedEvents: 1,
        },
      ]),
      aggregateCostTrend: jest.fn().mockResolvedValue([]),
      paidRevenue: jest.fn().mockResolvedValue(20),
      paidRevenueTrend: jest.fn().mockResolvedValue([]),
    } as unknown as RevenueCostRepository;
    const lifecycle = {
      findOpeningSnapshots: jest
        .fn()
        .mockResolvedValue([
          { revenueActive: true },
          { revenueActive: true },
          { revenueActive: false },
        ]),
      findCohortOrganizations: jest.fn().mockResolvedValue([]),
      findLifetimePaidRevenue: jest.fn().mockResolvedValue([]),
    } as unknown as RevenueLifecycleRepository;
    const reconciliation = {
      reconcile: jest.fn().mockResolvedValue(0),
    } as unknown as RevenueCostReconciliationService;
    const acquisition = {
      analytics: jest.fn().mockResolvedValue({
        salesCostUsd: 0,
        marketingCostUsd: 0,
        totalCostUsd: 0,
        newlyAcquiredOrganizations: 0,
        coveredMonths: 0,
        expectedMonths: 1,
        availability: RevenueAnalyticsAvailability.UNAVAILABLE,
        channels: [],
      }),
    } as unknown as RevenueAcquisitionCostService;
    const service = new RevenueUnitEconomicsService(
      costs,
      lifecycle,
      reconciliation,
      acquisition,
    );

    const result = await service.getUnitEconomics({
      from: new Date('2026-11-01T00:00:00.000Z'),
      to: new Date('2026-12-01T00:00:00.000Z'),
      timezone: 'UTC',
    });

    expect(result.providerCosts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          provider: RevenueServiceProvider.AI,
          costUsd: 4,
          availability: RevenueAnalyticsAvailability.AVAILABLE,
        }),
        expect.objectContaining({
          provider: RevenueServiceProvider.TWILIO,
          costUsd: 3,
          availability: RevenueAnalyticsAvailability.PARTIAL,
        }),
        expect.objectContaining({
          provider: RevenueServiceProvider.RECALL,
          costUsd: null,
          availability: RevenueAnalyticsAvailability.UNAVAILABLE,
        }),
      ]),
    );
    expect(
      result.summary.find(
        (metric) => metric.key === RevenueAnalyticsMetricKey.GROSS_MARGIN,
      ),
    ).toMatchObject({
      value: 65,
      availability: RevenueAnalyticsAvailability.PARTIAL,
      isEstimated: true,
    });
    expect(
      result.summary.find(
        (metric) => metric.key === RevenueAnalyticsMetricKey.COST_PER_AI_TASK,
      ),
    ).toMatchObject({ value: 2 });
    expect(
      result.summary.find(
        (metric) =>
          metric.key === RevenueAnalyticsMetricKey.COST_PER_ORGANIZATION,
      ),
    ).toMatchObject({ value: 3.5 });
  });

  it('does not convert missing cost coverage into zero', async () => {
    const costs = {
      aggregateCosts: jest.fn().mockResolvedValue([]),
      aggregateCostTrend: jest.fn().mockResolvedValue([]),
      paidRevenue: jest.fn().mockResolvedValue(100),
      paidRevenueTrend: jest.fn().mockResolvedValue([]),
    } as unknown as RevenueCostRepository;
    const lifecycle = {
      findOpeningSnapshots: jest
        .fn()
        .mockResolvedValue([{ revenueActive: true }]),
      findCohortOrganizations: jest.fn().mockResolvedValue([]),
      findLifetimePaidRevenue: jest.fn().mockResolvedValue([]),
    } as unknown as RevenueLifecycleRepository;
    const reconciliation = {
      reconcile: jest.fn().mockResolvedValue(0),
    } as unknown as RevenueCostReconciliationService;
    const acquisition = {
      analytics: jest.fn().mockResolvedValue({
        salesCostUsd: 0,
        marketingCostUsd: 0,
        totalCostUsd: 0,
        newlyAcquiredOrganizations: 0,
        coveredMonths: 0,
        expectedMonths: 1,
        availability: RevenueAnalyticsAvailability.UNAVAILABLE,
        channels: [],
      }),
    } as unknown as RevenueAcquisitionCostService;

    const result = await new RevenueUnitEconomicsService(
      costs,
      lifecycle,
      reconciliation,
      acquisition,
    ).getUnitEconomics({
      from: new Date('2026-11-01T00:00:00.000Z'),
      to: new Date('2026-12-01T00:00:00.000Z'),
      timezone: 'UTC',
    });

    expect(
      result.summary.find(
        (metric) => metric.key === RevenueAnalyticsMetricKey.GROSS_MARGIN,
      ),
    ).toMatchObject({
      value: null,
      availability: RevenueAnalyticsAvailability.UNAVAILABLE,
    });
  });

  it('calculates blended CAC, realized LTV/CAC, and payback', async () => {
    const costs = {
      aggregateCosts: jest.fn().mockResolvedValue([
        {
          provider: RevenueServiceProvider.AI,
          eventCount: 10,
          quantity: 10,
          costUsd: 20,
          costAvailableEvents: 10,
          estimatedEvents: 0,
        },
      ]),
      aggregateCostTrend: jest.fn().mockResolvedValue([]),
      paidRevenue: jest.fn().mockResolvedValue(100),
      paidRevenueTrend: jest.fn().mockResolvedValue([]),
    } as unknown as RevenueCostRepository;
    const lifecycle = {
      findOpeningSnapshots: jest
        .fn()
        .mockResolvedValue([{ revenueActive: true }, { revenueActive: true }]),
      findCohortOrganizations: jest
        .fn()
        .mockResolvedValue([{ organizationId: '1' }, { organizationId: '2' }]),
      findLifetimePaidRevenue: jest.fn().mockResolvedValue([
        { organizationId: '1', paidRevenueUsd: 200 },
        { organizationId: '2', paidRevenueUsd: 100 },
      ]),
    } as unknown as RevenueLifecycleRepository;
    const reconciliation = {
      reconcile: jest.fn().mockResolvedValue(0),
    } as unknown as RevenueCostReconciliationService;
    const acquisition = {
      analytics: jest.fn().mockResolvedValue({
        salesCostUsd: 10,
        marketingCostUsd: 30,
        totalCostUsd: 40,
        newlyAcquiredOrganizations: 2,
        coveredMonths: 1,
        expectedMonths: 1,
        availability: RevenueAnalyticsAvailability.AVAILABLE,
        channels: [],
      }),
    } as unknown as RevenueAcquisitionCostService;

    const result = await new RevenueUnitEconomicsService(
      costs,
      lifecycle,
      reconciliation,
      acquisition,
    ).getUnitEconomics({
      from: new Date('2026-11-01T00:00:00.000Z'),
      to: new Date('2026-12-01T00:00:00.000Z'),
      timezone: 'UTC',
    });

    expect(
      result.summary.find(
        (metric) =>
          metric.key === RevenueAnalyticsMetricKey.CUSTOMER_ACQUISITION_COST,
      ),
    ).toMatchObject({ value: 20 });
    expect(
      result.summary.find(
        (metric) => metric.key === RevenueAnalyticsMetricKey.LTV_CAC_RATIO,
      ),
    ).toMatchObject({ value: 7.5 });
    expect(
      result.summary.find(
        (metric) => metric.key === RevenueAnalyticsMetricKey.CAC_PAYBACK_PERIOD,
      ),
    ).toMatchObject({
      value: 0.49,
      availability: RevenueAnalyticsAvailability.AVAILABLE,
    });
  });
});
