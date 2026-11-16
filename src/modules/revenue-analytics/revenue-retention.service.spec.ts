import { BadRequestException } from '@nestjs/common';
import {
  RevenueAnalyticsAvailability,
  RevenueAnalyticsMetricKey,
  RevenueAnalyticsMovementType,
  RevenueAnalyticsNormalizationSource,
} from './revenue-analytics.enums';
import { RevenueLifecycleRepository } from './revenue-lifecycle.repository';
import { RevenueRetentionService } from './revenue-retention.service';

describe('RevenueRetentionService', () => {
  let repository: Record<string, jest.Mock>;
  let service: RevenueRetentionService;

  beforeEach(() => {
    repository = {
      findOpeningSnapshots: jest.fn().mockResolvedValue([
        {
          snapshotDate: new Date('2026-10-31T00:00:00.000Z'),
          organizationId: 'org-1',
          planId: 'plan-1',
          normalizedMrrUsd: 100,
          revenueActive: true,
          isEstimated: false,
          availability: RevenueAnalyticsAvailability.AVAILABLE,
          observedAt: new Date('2026-10-31T23:00:00.000Z'),
        },
        {
          snapshotDate: new Date('2026-10-31T00:00:00.000Z'),
          organizationId: 'org-2',
          planId: 'plan-1',
          normalizedMrrUsd: 200,
          revenueActive: true,
          isEstimated: false,
          availability: RevenueAnalyticsAvailability.AVAILABLE,
          observedAt: new Date('2026-10-31T23:00:00.000Z'),
        },
      ]),
      countOrganizationsStartedBefore: jest.fn().mockResolvedValue(2),
      findMovements: jest
        .fn()
        .mockResolvedValue([
          movement('org-1', RevenueAnalyticsMovementType.EXPANSION, 100, 120),
          movement('org-2', RevenueAnalyticsMovementType.CHURN, 200, 0),
          movement('org-3', RevenueAnalyticsMovementType.BASELINE, 0, 50),
        ]),
      findLifetimePaidRevenue: jest.fn().mockResolvedValue([
        {
          organizationId: 'org-1',
          planId: 'plan-1',
          paidRevenueUsd: 100,
          firstPaidAt: new Date('2026-01-01T00:00:00.000Z'),
          lastPaidAt: new Date('2026-11-01T00:00:00.000Z'),
          invoiceCount: 2,
        },
        {
          organizationId: 'org-1',
          planId: 'plan-2',
          paidRevenueUsd: 50,
          firstPaidAt: new Date('2026-05-01T00:00:00.000Z'),
          lastPaidAt: new Date('2026-10-01T00:00:00.000Z'),
          invoiceCount: 1,
        },
        {
          organizationId: 'org-2',
          planId: 'plan-1',
          paidRevenueUsd: 200,
          firstPaidAt: new Date('2026-02-01T00:00:00.000Z'),
          lastPaidAt: new Date('2026-10-01T00:00:00.000Z'),
          invoiceCount: 2,
        },
      ]),
      findCohortOrganizations: jest.fn().mockResolvedValue([]),
      findTrackingStartedAt: jest
        .fn()
        .mockResolvedValue(new Date('2026-10-01T00:00:00.000Z')),
      findPlanLabels: jest.fn().mockResolvedValue(
        new Map([
          ['plan-1', { id: 'plan-1', name: 'Starter' }],
          ['plan-2', { id: 'plan-2', name: 'Growth' }],
        ]),
      ),
      findSnapshotsAtDates: jest.fn().mockResolvedValue([]),
    };
    service = new RevenueRetentionService(
      repository as unknown as RevenueLifecycleRepository,
    );
  });

  it('calculates opening-cohort churn, NRR, and measured invoice LTV', async () => {
    const response = await service.getRetention({
      from: new Date('2026-11-01T00:00:00.000Z'),
      to: new Date('2026-12-01T00:00:00.000Z'),
      timezone: 'UTC',
    });

    expect(
      metric(response, RevenueAnalyticsMetricKey.LOGO_CHURN_RATE),
    ).toMatchObject({
      value: 50,
      availability: RevenueAnalyticsAvailability.AVAILABLE,
    });
    expect(
      metric(response, RevenueAnalyticsMetricKey.REVENUE_CHURN_RATE),
    ).toMatchObject({ value: 66.67 });
    expect(
      metric(response, RevenueAnalyticsMetricKey.NET_REVENUE_RETENTION),
    ).toMatchObject({ value: 40 });
    expect(
      metric(response, RevenueAnalyticsMetricKey.REALIZED_LTV),
    ).toMatchObject({
      value: 175,
      availability: RevenueAnalyticsAvailability.PARTIAL,
      isEstimated: false,
    });
    expect(response.trend[0]).toMatchObject({
      openingOrganizations: 2,
      churnedOrganizations: 1,
      openingMrrUsd: 300,
      expansionMrrUsd: 20,
      churnedMrrUsd: 200,
      netRevenueRetention: 40,
    });
    expect(response.coverage.paidInvoiceOrganizations).toBe(2);
  });

  it('returns unavailable metrics instead of fabricated zeroes without an opening snapshot', async () => {
    repository.findOpeningSnapshots.mockResolvedValue([]);
    repository.countOrganizationsStartedBefore.mockResolvedValue(3);
    repository.findMovements.mockResolvedValue([]);

    const response = await service.getRetention({
      from: new Date('2026-11-01T00:00:00.000Z'),
      to: new Date('2026-12-01T00:00:00.000Z'),
      timezone: 'UTC',
    });

    expect(
      metric(response, RevenueAnalyticsMetricKey.LOGO_CHURN_RATE),
    ).toMatchObject({
      value: null,
      availability: RevenueAnalyticsAvailability.UNAVAILABLE,
    });
    expect(response.trend[0]).toMatchObject({
      openingOrganizations: 0,
      logoChurnRate: null,
      availability: RevenueAnalyticsAvailability.UNAVAILABLE,
    });
  });

  it('keeps cohort cells unavailable when the daily snapshot is missing', async () => {
    repository.findCohortOrganizations.mockResolvedValue([
      {
        organizationId: 'org-new',
        planId: 'plan-1',
        subscriptionStartedAt: new Date('2026-11-10T00:00:00.000Z'),
      },
    ]);

    const response = await service.getRetention({
      from: new Date('2026-11-01T00:00:00.000Z'),
      to: new Date('2027-01-01T00:00:00.000Z'),
      timezone: 'UTC',
    });

    expect(response.cohorts[0]).toMatchObject({
      cohort: '2026-11',
      originalOrganizations: 1,
    });
    expect(response.cohorts[0].months[0]).toEqual({
      month: 0,
      retainedOrganizations: null,
      retentionRate: null,
      availability: RevenueAnalyticsAvailability.UNAVAILABLE,
    });
  });

  it('rejects an invalid or unbounded analytics range before querying storage', async () => {
    await expect(
      service.getRetention({
        from: new Date('2026-12-01T00:00:00.000Z'),
        to: new Date('2026-11-01T00:00:00.000Z'),
        timezone: 'UTC',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    await expect(
      service.getRetention({
        from: new Date('2025-01-01T00:00:00.000Z'),
        to: new Date('2026-12-01T00:00:00.000Z'),
        timezone: 'UTC',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(repository.findOpeningSnapshots).not.toHaveBeenCalled();
  });
});

function movement(
  organizationId: string,
  type: RevenueAnalyticsMovementType,
  previousMrrUsd: number,
  nextMrrUsd: number,
) {
  return {
    dedupeKey: `${organizationId}-${type}`,
    organizationId,
    subscriptionId: `${organizationId}-subscription`,
    type,
    previousPlanId: 'plan-1',
    nextPlanId: 'plan-1',
    previousMrrUsd,
    nextMrrUsd,
    deltaMrrUsd: nextMrrUsd - previousMrrUsd,
    isEstimated: false,
    normalizationSource:
      RevenueAnalyticsNormalizationSource.SUBSCRIPTION_SNAPSHOT,
    effectiveAt: new Date('2026-11-15T00:00:00.000Z'),
    observedAt: new Date('2026-11-15T01:00:00.000Z'),
  };
}

function metric(
  response: Awaited<ReturnType<RevenueRetentionService['getRetention']>>,
  key: RevenueAnalyticsMetricKey,
) {
  return response.summary.find((item) => item.key === key);
}
