import { ConfigService } from '@nestjs/config';
import { StripeProvider } from '../stripe/stripe.provider';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { TwilioProvisioningQueue } from './twilio-provisioning.queue';
import { TwilioUsageRepository } from './twilio-usage.repository';
import { TwilioUsageService } from './twilio-usage.service';
import { UsersService } from '../users/users.service';

describe('TwilioUsageService', () => {
  let repository: Record<string, jest.Mock>;
  let queue: Record<string, jest.Mock>;
  let subscriptions: Record<string, jest.Mock>;
  let config: { get: jest.Mock };
  let service: TwilioUsageService;

  beforeEach(() => {
    repository = {
      createCallEvent: jest.fn(),
      incrementPeriod: jest.fn(),
      updateEventBilling: jest.fn(),
      findEvent: jest.fn(),
      findCurrentPeriod: jest.fn(),
      claimAlert: jest.fn(),
    };
    queue = { enqueueOverageBilling: jest.fn() };
    subscriptions = {
      getMine: jest.fn().mockResolvedValue({
        subscription: {
          stripeCustomerId: 'cus_1',
          currentPeriodStart: new Date('2026-09-01T00:00:00.000Z'),
          currentPeriodEnd: new Date('2026-10-01T00:00:00.000Z'),
          snapshotLimits: {
            callMinutesPerMonth: 100,
            extraCallMinutePriceUsd: 0.2,
          },
        },
      }),
    };
    const stripe = { createCallOverageInvoiceItem: jest.fn() };
    config = {
      get: jest.fn((_key: string, fallback: unknown) => fallback),
    };
    const users = { findByOrganization: jest.fn().mockResolvedValue([]) };
    service = new TwilioUsageService(
      repository as unknown as TwilioUsageRepository,
      subscriptions as unknown as SubscriptionsService,
      stripe as unknown as StripeProvider,
      queue as unknown as TwilioProvisioningQueue,
      config as unknown as ConfigService,
      users as unknown as UsersService,
    );
  });

  it('bills only the part of a call beyond the included 100 minutes', async () => {
    repository.createCallEvent.mockResolvedValue({ sourceId: 'CA1' });
    repository.incrementPeriod.mockResolvedValue({ totalSeconds: 6060 });

    await service.recordCompletedCall('org-1', 'CA1', 120);

    expect(repository.updateEventBilling).toHaveBeenCalledWith('CA1', {
      includedQuantity: 60,
      overageQuantity: 60,
      cost: 0.2,
      billingStatus: 'PENDING',
    });
    expect(queue.enqueueOverageBilling).toHaveBeenCalledWith('CA1');
  });

  it('does not count or charge a repeated Twilio callback', async () => {
    repository.createCallEvent.mockResolvedValue(null);

    await service.recordCompletedCall('org-1', 'CA1', 120);

    expect(repository.incrementPeriod).not.toHaveBeenCalled();
    expect(queue.enqueueOverageBilling).not.toHaveBeenCalled();
  });

  it('records test calls without loading or billing a subscription', async () => {
    config.get.mockImplementation((key: string, fallback: unknown) =>
      key === 'twilio.subscriptionEnforcementEnabled' ? false : fallback,
    );
    repository.createCallEvent.mockResolvedValue({ sourceId: 'CA2' });
    repository.incrementPeriod.mockResolvedValue({ totalSeconds: 120 });

    await service.recordCompletedCall('org-1', 'CA2', 120);

    expect(subscriptions.getMine).not.toHaveBeenCalled();
    expect(repository.updateEventBilling).toHaveBeenCalledWith('CA2', {
      includedQuantity: 120,
      overageQuantity: 0,
      cost: 0,
      billingStatus: 'NOT_REQUIRED',
    });
    expect(queue.enqueueOverageBilling).not.toHaveBeenCalled();
  });

  it('skips the spending-limit subscription lookup in test mode', async () => {
    config.get.mockImplementation((key: string, fallback: unknown) =>
      key === 'twilio.subscriptionEnforcementEnabled' ? false : fallback,
    );

    await service.assertWithinSpendingLimit('org-1');

    expect(subscriptions.getMine).not.toHaveBeenCalled();
    expect(repository.findCurrentPeriod).not.toHaveBeenCalled();
  });
});
