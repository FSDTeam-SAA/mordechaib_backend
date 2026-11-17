import { resolveUsagePeriod } from './usage-period.helper';

describe('resolveUsagePeriod', () => {
  it('uses the Stripe period for monthly subscriptions', () => {
    expect(
      resolveUsagePeriod(
        {
          billingInterval: 'month',
          currentPeriodStart: new Date('2026-11-17T00:00:00.000Z'),
          currentPeriodEnd: new Date('2026-12-17T00:00:00.000Z'),
        },
        new Date('2026-11-20T00:00:00.000Z'),
      ),
    ).toEqual({
      periodStart: new Date('2026-11-17T00:00:00.000Z'),
      periodEnd: new Date('2026-12-17T00:00:00.000Z'),
    });
  });

  it('resets monthly usage inside a yearly subscription', () => {
    expect(
      resolveUsagePeriod(
        {
          billingInterval: 'year',
          currentPeriodStart: new Date('2026-01-17T00:00:00.000Z'),
          currentPeriodEnd: new Date('2027-01-17T00:00:00.000Z'),
        },
        new Date('2026-11-20T00:00:00.000Z'),
      ),
    ).toEqual({
      periodStart: new Date('2026-11-01T00:00:00.000Z'),
      periodEnd: new Date('2026-12-01T00:00:00.000Z'),
    });
  });
});
