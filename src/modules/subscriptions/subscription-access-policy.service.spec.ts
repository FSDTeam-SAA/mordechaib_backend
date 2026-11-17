import { ConfigService } from '@nestjs/config';
import { SubscriptionStatus } from '../../common/enums/subscription-status.enum';
import {
  SubscriptionAccessPolicyService,
  SubscriptionAccessReason,
} from './subscription-access-policy.service';
import { SubscriptionsRepository } from './subscriptions.repository';

describe('SubscriptionAccessPolicyService', () => {
  const organizationId = 'organization-1';
  let repository: { findByOrganizationId: jest.Mock };

  const createService = (enabled: boolean) =>
    new SubscriptionAccessPolicyService(
      repository as unknown as SubscriptionsRepository,
      {
        get: jest.fn((key: string, fallback: unknown) =>
          key === 'subscriptions.accessGateEnabled' ? enabled : fallback,
        ),
      } as unknown as ConfigService,
    );

  beforeEach(() => {
    repository = { findByOrganizationId: jest.fn() };
  });

  it('preserves legacy access without querying subscriptions when disabled', async () => {
    await expect(
      createService(false).getDecision(organizationId),
    ).resolves.toEqual(
      expect.objectContaining({
        gateEnabled: false,
        canUsePlatform: true,
        subscriptionRequired: false,
        reason: SubscriptionAccessReason.GATE_DISABLED,
      }),
    );
    expect(repository.findByOrganizationId).not.toHaveBeenCalled();
  });

  it.each([SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIALING])(
    'allows an eligible %s subscription',
    async (status) => {
      repository.findByOrganizationId.mockResolvedValue({ status });

      await expect(
        createService(true).getDecision(organizationId),
      ).resolves.toEqual(
        expect.objectContaining({
          canUsePlatform: true,
          subscriptionActive: true,
          subscriptionRequired: false,
          reason: SubscriptionAccessReason.ELIGIBLE,
          subscriptionStatus: status,
        }),
      );
    },
  );

  it('blocks access when no product subscription exists', async () => {
    repository.findByOrganizationId.mockResolvedValue(null);

    await expect(
      createService(true).getDecision(organizationId),
    ).resolves.toEqual(
      expect.objectContaining({
        canUsePlatform: false,
        subscriptionRequired: true,
        reason: SubscriptionAccessReason.NO_SUBSCRIPTION,
      }),
    );
  });

  it('blocks a paused active subscription', async () => {
    repository.findByOrganizationId.mockResolvedValue({
      status: SubscriptionStatus.ACTIVE,
      pausedUntil: new Date('2027-01-02T00:00:00.000Z'),
    });

    const decision = await createService(true).getDecision(
      organizationId,
      new Date('2027-01-01T00:00:00.000Z'),
    );

    expect(decision.reason).toBe(SubscriptionAccessReason.PAUSED);
    expect(decision.canUsePlatform).toBe(false);
  });

  it.each([
    [SubscriptionStatus.INCOMPLETE, SubscriptionAccessReason.INCOMPLETE],
    [SubscriptionStatus.PAST_DUE, SubscriptionAccessReason.PAST_DUE],
    [SubscriptionStatus.CANCELED, SubscriptionAccessReason.CANCELED],
  ])('blocks a %s subscription', async (status, reason) => {
    repository.findByOrganizationId.mockResolvedValue({ status });

    const decision = await createService(true).getDecision(organizationId);

    expect(decision.reason).toBe(reason);
    expect(decision.canUsePlatform).toBe(false);
  });

  it('does not classify a canceled subscription as paused from stale metadata', async () => {
    repository.findByOrganizationId.mockResolvedValue({
      status: SubscriptionStatus.CANCELED,
      pausedUntil: new Date('2027-01-02T00:00:00.000Z'),
    });

    const decision = await createService(true).getDecision(
      organizationId,
      new Date('2027-01-01T00:00:00.000Z'),
    );

    expect(decision.reason).toBe(SubscriptionAccessReason.CANCELED);
  });

  it('returns a stable machine-readable denial code', async () => {
    repository.findByOrganizationId.mockResolvedValue(null);

    await expect(
      createService(true).assertCanUsePlatform(organizationId),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'SUBSCRIPTION_NO_SUBSCRIPTION',
      }),
    });
  });
});
