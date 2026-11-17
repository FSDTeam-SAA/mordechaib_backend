import { SubscriptionStatus } from '../../common/enums/subscription-status.enum';
import { OrganizationsService } from '../organizations/organizations.service';
import { PackageInquiriesService } from '../package-inquiries/package-inquiries.service';
import { SubscriptionPlansService } from './subscription-plans.service';
import { SubscriptionsRepository } from './subscriptions.repository';
import { SubscriptionsService } from './subscriptions.service';

describe('SubscriptionsService activation snapshot', () => {
  it('stores annual plan revenue as a monthly-equivalent snapshot', async () => {
    const repository = { upsertForOrganization: jest.fn() };
    const plans = {
      findById: jest.fn().mockResolvedValue({
        priceUsd: 120,
        annualPriceUsd: 1200,
        aiActionsPerMonth: 10_000,
        crmContactsLimit: 20_000,
        callMinutesPerMonth: 500,
        usersIncluded: 5,
        aiAgentsIncluded: 6,
      }),
    };
    const service = new SubscriptionsService(
      repository as unknown as SubscriptionsRepository,
      plans as unknown as SubscriptionPlansService,
      {} as OrganizationsService,
      {} as PackageInquiriesService,
    );

    await service.activateSubscription({
      organizationId: 'organization-1',
      planId: 'plan-growth',
      stripeCustomerId: 'cus_1',
      stripeSubscriptionId: 'sub_1',
      status: SubscriptionStatus.ACTIVE,
      currentPeriodStart: new Date('2026-01-01T00:00:00.000Z'),
      currentPeriodEnd: new Date('2027-01-01T00:00:00.000Z'),
      billingInterval: 'year',
    });

    expect(repository.upsertForOrganization).toHaveBeenCalledWith(
      expect.objectContaining({
        billingInterval: 'year',
        snapshotLimits: expect.objectContaining({ priceUsd: 100 }),
      }),
    );
  });
});
