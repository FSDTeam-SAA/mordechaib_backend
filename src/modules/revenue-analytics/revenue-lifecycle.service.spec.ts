import { SubscriptionStatus } from '../../common/enums/subscription-status.enum';
import {
  RevenueAnalyticsAvailability,
  RevenueAnalyticsMovementType,
  RevenueAnalyticsNormalizationSource,
} from './revenue-analytics.enums';
import { RevenueLifecycleRepository } from './revenue-lifecycle.repository';
import { RevenueLifecycleService } from './revenue-lifecycle.service';
import { RevenueStateRecord } from './revenue-lifecycle.types';

describe('RevenueLifecycleService', () => {
  const observedAt = new Date('2026-11-16T05:00:00.000Z');
  let repository: Record<string, jest.Mock>;
  let service: RevenueLifecycleService;

  beforeEach(() => {
    repository = {
      listSubscriptions: jest
        .fn()
        .mockResolvedValueOnce([
          {
            id: '507f191e810c19729de860ea',
            organizationId: 'org-1',
            planId: '507f191e810c19729de860eb',
            status: SubscriptionStatus.ACTIVE,
            billingInterval: 'year',
            updatedAt: new Date('2026-11-16T04:00:00.000Z'),
            createdAt: new Date('2026-10-01T00:00:00.000Z'),
            monthlyPriceUsd: 149,
            monthlyAddonRevenueUsd: 10,
          },
        ])
        .mockResolvedValueOnce([]),
      findPlans: jest.fn().mockResolvedValue(
        new Map([
          [
            '507f191e810c19729de860eb',
            {
              id: '507f191e810c19729de860eb',
              monthlyPriceUsd: 149,
              annualPriceUsd: 1490,
            },
          ],
        ]),
      ),
      findStates: jest.fn().mockResolvedValue(new Map()),
      findLatestExecutedCancellations: jest.fn().mockResolvedValue(new Map()),
      persistBatch: jest.fn().mockResolvedValue(undefined),
      sourceCoverage: jest
        .fn()
        .mockResolvedValue({ paidInvoices: 10, executedCancellations: 2 }),
    };
    service = new RevenueLifecycleService(
      repository as unknown as RevenueLifecycleRepository,
    );
  });

  it('seeds historical subscriptions as a baseline and normalizes annual MRR', async () => {
    const result = await service.reconcile(observedAt);
    const persisted = repository.persistBatch.mock.calls[0][0] as {
      states: RevenueStateRecord[];
      movements: { type: RevenueAnalyticsMovementType }[];
    };

    expect(persisted.states[0]).toMatchObject({
      normalizedMrrUsd: 134.17,
      revenueActive: true,
      isEstimated: true,
      availability: RevenueAnalyticsAvailability.PARTIAL,
      normalizationSource: RevenueAnalyticsNormalizationSource.PLAN_CATALOG,
    });
    expect(persisted.movements).toEqual([
      expect.objectContaining({ type: RevenueAnalyticsMovementType.BASELINE }),
    ]);
    expect(result).toMatchObject({
      subscriptionsRead: 1,
      statesChanged: 1,
      movementsRecorded: 1,
      snapshotsWritten: 1,
    });
  });

  it('records one expansion movement for a revenue-changing plan switch', async () => {
    const previous: RevenueStateRecord = {
      organizationId: 'org-1',
      subscriptionId: '507f191e810c19729de860ea',
      planId: 'old-plan',
      status: SubscriptionStatus.ACTIVE,
      billingInterval: 'month',
      normalizedMrrUsd: 100,
      revenueActive: true,
      paused: false,
      isEstimated: false,
      availability: RevenueAnalyticsAvailability.AVAILABLE,
      normalizationSource:
        RevenueAnalyticsNormalizationSource.SUBSCRIPTION_SNAPSHOT,
      sourceUpdatedAt: new Date('2026-11-15T04:00:00.000Z'),
      observedAt: new Date('2026-11-15T05:00:00.000Z'),
      fingerprint: 'previous',
    };
    repository.findStates.mockResolvedValue(new Map([['org-1', previous]]));

    await service.reconcile(observedAt);
    const movements = repository.persistBatch.mock.calls[0][0].movements;
    expect(movements).toEqual([
      expect.objectContaining({
        type: RevenueAnalyticsMovementType.EXPANSION,
        previousPlanId: 'old-plan',
        nextPlanId: '507f191e810c19729de860eb',
      }),
    ]);
  });

  it('uses the executed cancellation time for effective churn', async () => {
    const previous: RevenueStateRecord = {
      organizationId: 'org-1',
      subscriptionId: '507f191e810c19729de860ea',
      planId: '507f191e810c19729de860eb',
      status: SubscriptionStatus.ACTIVE,
      billingInterval: 'year',
      normalizedMrrUsd: 134.17,
      revenueActive: true,
      paused: false,
      isEstimated: true,
      availability: RevenueAnalyticsAvailability.PARTIAL,
      normalizationSource: RevenueAnalyticsNormalizationSource.PLAN_CATALOG,
      sourceUpdatedAt: new Date('2026-11-15T04:00:00.000Z'),
      observedAt: new Date('2026-11-15T05:00:00.000Z'),
      fingerprint: 'previous',
    };
    const executedAt = new Date('2026-11-16T03:30:00.000Z');
    repository.listSubscriptions.mockReset();
    repository.listSubscriptions
      .mockResolvedValueOnce([
        {
          id: '507f191e810c19729de860ea',
          organizationId: 'org-1',
          planId: '507f191e810c19729de860eb',
          status: SubscriptionStatus.CANCELED,
          billingInterval: 'year',
          updatedAt: new Date('2026-11-16T04:00:00.000Z'),
          monthlyPriceUsd: 149,
          monthlyAddonRevenueUsd: 10,
        },
      ])
      .mockResolvedValueOnce([]);
    repository.findStates.mockResolvedValue(new Map([['org-1', previous]]));
    repository.findLatestExecutedCancellations.mockResolvedValue(
      new Map([['org-1', executedAt]]),
    );

    await service.reconcile(observedAt);
    const movements = repository.persistBatch.mock.calls[0][0].movements;
    expect(movements).toEqual([
      expect.objectContaining({
        type: RevenueAnalyticsMovementType.CHURN,
        effectiveAt: executedAt,
        previousMrrUsd: 134.17,
        nextMrrUsd: 0,
        deltaMrrUsd: -134.17,
      }),
    ]);
  });

  it('records a pause without duplicating the MRR reduction as suspension', async () => {
    const previous: RevenueStateRecord = {
      organizationId: 'org-1',
      subscriptionId: '507f191e810c19729de860ea',
      planId: '507f191e810c19729de860eb',
      status: SubscriptionStatus.ACTIVE,
      billingInterval: 'year',
      normalizedMrrUsd: 134.17,
      revenueActive: true,
      paused: false,
      isEstimated: true,
      availability: RevenueAnalyticsAvailability.PARTIAL,
      normalizationSource: RevenueAnalyticsNormalizationSource.PLAN_CATALOG,
      sourceUpdatedAt: new Date('2026-11-15T04:00:00.000Z'),
      observedAt: new Date('2026-11-15T05:00:00.000Z'),
      fingerprint: 'previous',
    };
    repository.listSubscriptions.mockReset();
    repository.listSubscriptions.mockResolvedValueOnce([
      {
        id: '507f191e810c19729de860ea',
        organizationId: 'org-1',
        planId: '507f191e810c19729de860eb',
        status: SubscriptionStatus.ACTIVE,
        billingInterval: 'year',
        pausedUntil: new Date('2026-12-01T00:00:00.000Z'),
        updatedAt: new Date('2026-11-16T04:00:00.000Z'),
        monthlyPriceUsd: 149,
        monthlyAddonRevenueUsd: 10,
      },
    ]);
    repository.findStates.mockResolvedValue(new Map([['org-1', previous]]));

    await service.reconcile(observedAt);

    expect(repository.persistBatch.mock.calls[0][0].movements).toEqual([
      expect.objectContaining({
        type: RevenueAnalyticsMovementType.PAUSE,
        deltaMrrUsd: -134.17,
      }),
    ]);
  });

  it('coalesces concurrent reconciliation in one process', async () => {
    const first = service.reconcile(observedAt);
    const second = service.reconcile(observedAt);
    expect(first).toBe(second);
    await first;
    expect(repository.listSubscriptions).toHaveBeenCalledTimes(1);
  });
});
