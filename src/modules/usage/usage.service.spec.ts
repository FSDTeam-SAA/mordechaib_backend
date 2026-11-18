import { AddonCategory } from '../../common/enums/addon-category.enum';
import { PlanType } from '../../common/enums/plan-type.enum';
import { SubscriptionStatus } from '../../common/enums/subscription-status.enum';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { UsageRepository } from './usage.repository';
import { UsageService } from './usage.service';

describe('UsageService', () => {
  const periodStart = new Date('2026-11-01T00:00:00.000Z');
  const periodEnd = new Date('2026-12-01T00:00:00.000Z');
  const repository = {
    createEvent: jest.fn(),
    aggregatePeriod: jest.fn(),
  };
  const subscriptions = {
    getMine: jest.fn(),
  };
  const service = new UsageService(
    repository as unknown as UsageRepository,
    subscriptions as unknown as SubscriptionsService,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    subscriptions.getMine.mockResolvedValue({
      subscription: {
        status: SubscriptionStatus.ACTIVE,
        billingInterval: 'month',
        currentPeriodStart: periodStart,
        currentPeriodEnd: periodEnd,
        snapshotLimits: {
          aiActionsPerMonth: 500,
          callMinutesPerMonth: 50,
          meetingHoursPerMonth: 10,
        },
        activeAddons: [
          { category: AddonCategory.AI_ACTIONS, quantity: 1_000 },
        ],
      },
      plan: { planType: PlanType.PAY_AS_YOU_GO },
    });
  });

  it('records one idempotent AI action with provider telemetry', async () => {
    repository.createEvent.mockResolvedValue({ created: true });

    await service.recordAiAction({
      organizationId: 'org-1',
      sourceId: '/api/v1/ai/chat:turn-1',
      path: '/api/v1/ai/chat',
      telemetry: { totalTokens: 125, costUsd: 0.004 },
    });

    expect(repository.createEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'org-1',
        provider: 'AI_BACKEND',
        metric: 'AI_ACTIONS',
        quantity: 1,
        cost: 0.004,
        periodStart,
        periodEnd,
      }),
    );
  });

  it('returns subscription limits plus add-ons and measured overage', async () => {
    repository.aggregatePeriod.mockResolvedValue([
      {
        provider: 'AI_BACKEND',
        metric: 'AI_ACTIONS',
        unit: 'ACTION',
        quantity: 1_600,
        costUsd: 2,
        events: 1_600,
      },
      {
        provider: 'TWILIO',
        metric: 'CALL_SECONDS',
        unit: 'SECOND',
        quantity: 3_600,
        costUsd: 2,
        events: 2,
      },
    ]);

    const result = await service.current('org-1');

    expect(result.metrics.aiActions).toEqual(
      expect.objectContaining({ used: 1_600, included: 1_500, overage: 100 }),
    );
    expect(result.metrics.callMinutes).toEqual(
      expect.objectContaining({ used: 60, included: 50, overage: 10 }),
    );
    expect(result.metrics.meetingHours).toEqual(
      expect.objectContaining({
        availability: 'UNAVAILABLE',
        reason: 'AUTHORITATIVE_RECALL_DURATION_NOT_RECORDED',
      }),
    );
  });
});
