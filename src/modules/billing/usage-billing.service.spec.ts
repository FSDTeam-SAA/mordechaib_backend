import { StripeProvider } from '../stripe/stripe.provider';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { UsageRepository } from '../usage/usage.repository';
import { UsageBillingRepository } from './usage-billing.repository';
import { UsageBillingService } from './usage-billing.service';

describe('UsageBillingService', () => {
  const periodStart = new Date('2026-10-01T00:00:00.000Z');
  const periodEnd = new Date('2026-11-01T00:00:00.000Z');

  const createSubject = () => {
    const usage = {
      aggregatePeriod: jest.fn().mockResolvedValue([
        {
          provider: 'AI_BACKEND',
          metric: 'AI_ACTIONS',
          unit: 'ACTION',
          quantity: 1,
          costUsd: 0.002,
          events: 1,
        },
      ]),
      aggregateBillingStatuses: jest.fn().mockResolvedValue([]),
    };
    const periods = {
      findMetric: jest.fn().mockResolvedValue(null),
      findPeriod: jest.fn().mockResolvedValue([]),
      upsert: jest.fn().mockImplementation((value) => Promise.resolve(value)),
      attachInvoice: jest.fn(),
    };
    const subscriptions = {
      getMine: jest.fn().mockResolvedValue({
        subscription: {
          stripeCustomerId: 'cus_123',
          stripeSubscriptionId: 'sub_123',
          currentPeriodStart: periodStart,
          currentPeriodEnd: periodEnd,
          snapshotLimits: {
            aiActionsPerMonth: 0,
            extraAiActionPriceUsd: 0.04,
            extraCallMinutePriceUsd: 0.2,
          },
          activeAddons: [],
        },
      }),
    };
    const stripe = {
      createUsageInvoiceItem: jest.fn().mockResolvedValue({ id: 'ii_123' }),
      createUsageInvoice: jest.fn(),
    };
    const service = new UsageBillingService(
      usage as unknown as UsageRepository,
      periods as unknown as UsageBillingRepository,
      subscriptions as unknown as SubscriptionsService,
      stripe as unknown as StripeProvider,
    );
    return { service, usage, periods, subscriptions, stripe };
  };

  it('creates one idempotent delta invoice item for measured AI overage', async () => {
    const { service, stripe } = createSubject();

    const result = await service.reconcile('org_123');

    expect(stripe.createUsageInvoiceItem).toHaveBeenCalledWith(
      expect.objectContaining({
        customerId: 'cus_123',
        amountCents: 4,
        metric: 'AI_ACTIONS',
        idempotencyKey: expect.stringContaining('usage-org_123-AI_ACTIONS'),
      }),
    );
    expect(result.totals.customerUsageChargeUsd).toBe(0.04);
  });

  it('does not create another item when the cumulative amount is reconciled', async () => {
    const { service, periods, stripe } = createSubject();
    periods.findMetric.mockResolvedValue({
      billedAmountUsd: 0.04,
      stripeInvoiceItemIds: ['ii_existing'],
    });

    await service.reconcile('org_123');

    expect(stripe.createUsageInvoiceItem).not.toHaveBeenCalled();
  });

  it('rejects invoice generation before a billing period has ended', async () => {
    const { service, subscriptions, stripe } = createSubject();
    subscriptions.getMine.mockResolvedValue({
      subscription: {
        stripeCustomerId: 'cus_123',
        stripeSubscriptionId: 'sub_123',
        currentPeriodStart: new Date('2099-01-01T00:00:00.000Z'),
        currentPeriodEnd: new Date('2099-02-01T00:00:00.000Z'),
        snapshotLimits: {},
        activeAddons: [],
      },
    });

    await expect(service.generateInvoice('org_123', {})).rejects.toThrow(
      'after the billing period ends',
    );
    expect(stripe.createUsageInvoice).not.toHaveBeenCalled();
  });
});
