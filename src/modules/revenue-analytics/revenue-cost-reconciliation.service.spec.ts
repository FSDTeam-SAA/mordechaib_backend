import { ConfigService } from '@nestjs/config';
import {
  RevenueAnalyticsAvailability,
  RevenueCostPricingSource,
  RevenueServiceProvider,
  RevenueUsageUnit,
} from './revenue-analytics.enums';
import { RevenueCostReconciliationService } from './revenue-cost-reconciliation.service';
import { RevenueCostRepository } from './revenue-cost.repository';
import { RevenueCostSourceRecord } from './revenue-cost.types';

describe('RevenueCostReconciliationService', () => {
  const source = (
    id: string,
    quantity: number,
    unit: RevenueUsageUnit,
    providerCostUsd?: number,
  ): RevenueCostSourceRecord => ({
    id,
    organizationId: 'org-1',
    sourceType: 'TEST',
    quantity,
    unit,
    providerCostUsd,
    occurredAt: new Date('2026-11-01T00:00:00.000Z'),
    updatedAt: new Date('2026-11-02T00:00:00.000Z'),
  });

  it('prefers measured AI cost and marks configured provider fallbacks estimated', async () => {
    const persisted: Array<{
      provider: RevenueServiceProvider;
      events: any[];
    }> = [];
    const repository = {
      cursor: jest.fn().mockResolvedValue(undefined),
      listAiSources: jest
        .fn()
        .mockResolvedValue([
          source('ai-1', 100, RevenueUsageUnit.TOKEN, 0.125),
        ]),
      listTwilioSources: jest
        .fn()
        .mockResolvedValue([source('call-1', 120, RevenueUsageUnit.SECOND)]),
      listRecallSources: jest
        .fn()
        .mockResolvedValue([source('meeting-1', 30, RevenueUsageUnit.MINUTE)]),
      persistBatch: jest.fn(async (provider, events) => {
        persisted.push({ provider, events });
      }),
      repriceFallbackCosts: jest.fn(),
    } as unknown as RevenueCostRepository;
    const rates: Record<string, number> = {
      'revenueAnalytics.aiFallbackCostPerOperationUsd': 99,
      'revenueAnalytics.twilioFallbackCostPerMinuteUsd': 0.02,
      'revenueAnalytics.recallFallbackCostPerMinuteUsd': 0.1,
    };
    const config = {
      get: jest.fn((key: string) => rates[key]),
    } as unknown as ConfigService;

    await new RevenueCostReconciliationService(repository, config).reconcile();

    expect(persisted[0].events[0]).toMatchObject({
      costUsd: 0.125,
      pricingSource: RevenueCostPricingSource.PROVIDER_REPORTED,
      isEstimated: false,
      availability: RevenueAnalyticsAvailability.AVAILABLE,
    });
    expect(persisted[1].events[0]).toMatchObject({
      costUsd: 0.04,
      pricingSource: RevenueCostPricingSource.CONFIGURED_FALLBACK,
      fallbackRateUsd: 0.02,
      isEstimated: true,
    });
    expect(persisted[2].events[0]).toMatchObject({
      costUsd: 3,
      pricingSource: RevenueCostPricingSource.CONFIGURED_FALLBACK,
      fallbackRateUsd: 0.1,
      isEstimated: true,
    });
  });

  it('keeps provider cost unavailable when no measured or fallback price exists', async () => {
    const persistBatch = jest.fn();
    const repository = {
      cursor: jest.fn().mockResolvedValue(undefined),
      listAiSources: jest
        .fn()
        .mockResolvedValue([source('ai-1', 1, RevenueUsageUnit.OPERATION)]),
      listTwilioSources: jest.fn().mockResolvedValue([]),
      listRecallSources: jest.fn().mockResolvedValue([]),
      persistBatch,
      repriceFallbackCosts: jest.fn(),
    } as unknown as RevenueCostRepository;
    const config = { get: jest.fn() } as unknown as ConfigService;

    await new RevenueCostReconciliationService(repository, config).reconcile();

    expect(persistBatch.mock.calls[0][1][0]).toMatchObject({
      costUsd: undefined,
      pricingSource: RevenueCostPricingSource.UNAVAILABLE,
      availability: RevenueAnalyticsAvailability.UNAVAILABLE,
      isEstimated: false,
    });
  });
});
