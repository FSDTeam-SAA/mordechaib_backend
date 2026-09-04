import { ConfigService } from '@nestjs/config';
import { SubscriptionStatus } from '../../common/enums/subscription-status.enum';
import { OrganizationsService } from '../organizations/organizations.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { TwilioEligibilityService } from './twilio-eligibility.service';

describe('TwilioEligibilityService', () => {
  const organizationId = 'org-1';
  let subscriptions: { getMine: jest.Mock };
  let organizations: { findCurrent: jest.Mock };

  const createService = (subscriptionEnforcementEnabled: boolean) => {
    const config = {
      get: jest.fn((key: string, fallback: unknown) =>
        key === 'twilio.subscriptionEnforcementEnabled'
          ? subscriptionEnforcementEnabled
          : fallback,
      ),
    };
    return new TwilioEligibilityService(
      subscriptions as unknown as SubscriptionsService,
      config as unknown as ConfigService,
      organizations as unknown as OrganizationsService,
    );
  };

  beforeEach(() => {
    subscriptions = { getMine: jest.fn() };
    organizations = {
      findCurrent: jest.fn().mockResolvedValue({ status: 'ACTIVE' }),
    };
  });

  it('allows an active organization without loading a subscription in test mode', async () => {
    await expect(
      createService(false).assertCanUseCalling(organizationId),
    ).resolves.toBeUndefined();

    expect(subscriptions.getMine).not.toHaveBeenCalled();
  });

  it('still requires the organization itself to be active in test mode', async () => {
    organizations.findCurrent.mockResolvedValue({ status: 'INACTIVE' });

    await expect(
      createService(false).assertCanUseCalling(organizationId),
    ).rejects.toThrow('The organization must be active');
  });

  it('enforces an active calling subscription when enabled', async () => {
    subscriptions.getMine.mockResolvedValue({
      subscription: {
        status: SubscriptionStatus.ACTIVE,
        snapshotLimits: { callMinutesPerMonth: 100 },
      },
    });

    await expect(
      createService(true).assertCanUseCalling(organizationId),
    ).resolves.toEqual(
      expect.objectContaining({ status: SubscriptionStatus.ACTIVE }),
    );
  });
});
