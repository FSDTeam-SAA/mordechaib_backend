import { ExecutionContext } from '@nestjs/common';
import { SubscriptionAccessPolicyService } from '../../modules/subscriptions/subscription-access-policy.service';
import { SubscriptionAccessGuard } from './subscription-access.guard';

describe('SubscriptionAccessGuard', () => {
  const access = { assertCanUsePlatform: jest.fn() };
  const guard = new SubscriptionAccessGuard(
    access as unknown as SubscriptionAccessPolicyService,
  );

  const context = (
    path: string,
    user?: { organizationId: string; isPlatformAdmin: boolean },
  ) =>
    ({
      switchToHttp: () => ({ getRequest: () => ({ path, user }) }),
    }) as unknown as ExecutionContext;

  beforeEach(() => jest.clearAllMocks());

  it('enforces the centralized policy for organization product routes', async () => {
    access.assertCanUsePlatform.mockResolvedValue({ canUsePlatform: true });

    await expect(
      guard.canActivate(
        context('/api/v1/messages', {
          organizationId: 'org-1',
          isPlatformAdmin: false,
        }),
      ),
    ).resolves.toBe(true);

    expect(access.assertCanUsePlatform).toHaveBeenCalledWith('org-1');
  });

  it.each([
    '/api/v1/subscription-plans',
    '/api/v1/subscriptions/current',
    '/api/v1/billing/checkout-session',
    '/api/v1/onboarding-setups/journey',
    '/api/v1/setup-packages',
    '/api/v1/organizations/current',
  ])('keeps subscription recovery route %s accessible', async (path) => {
    await expect(
      guard.canActivate(
        context(path, {
          organizationId: 'org-1',
          isPlatformAdmin: false,
        }),
      ),
    ).resolves.toBe(true);
    expect(access.assertCanUsePlatform).not.toHaveBeenCalled();
  });

  it('does not apply organization subscription policy to platform admins', async () => {
    await expect(
      guard.canActivate(
        context('/api/v1/platform/meeting-calendar', {
          organizationId: 'platform-org',
          isPlatformAdmin: true,
        }),
      ),
    ).resolves.toBe(true);
    expect(access.assertCanUsePlatform).not.toHaveBeenCalled();
  });

  it('leaves public and service-authenticated callbacks to their own guards', async () => {
    await expect(
      guard.canActivate(context('/api/v1/webhooks/stripe')),
    ).resolves.toBe(true);
    expect(access.assertCanUsePlatform).not.toHaveBeenCalled();
  });

  it('propagates the policy denial for an inactive subscription', async () => {
    access.assertCanUsePlatform.mockRejectedValue(new Error('denied'));

    await expect(
      guard.canActivate(
        context('/api/v1/crm/records', {
          organizationId: 'org-1',
          isPlatformAdmin: false,
        }),
      ),
    ).rejects.toThrow('denied');
  });
});
