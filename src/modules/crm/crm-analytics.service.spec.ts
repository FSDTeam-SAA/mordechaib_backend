import { CrmAnalyticsService } from './crm-analytics.service';
import { CrmDealsRepository } from './crm-deals.repository';

describe('CrmAnalyticsService', () => {
  const repository = { aggregateRevenue: jest.fn() };
  const service = new CrmAnalyticsService(
    repository as unknown as CrmDealsRepository,
  );

  beforeEach(() => jest.clearAllMocks());

  it('keeps currency totals separate', async () => {
    repository.aggregateRevenue.mockResolvedValue([
      {
        _id: { currency: 'USD', stage: 'OPEN' },
        totalAmount: 100,
        dealCount: 1,
      },
      {
        _id: { currency: 'EUR', stage: 'WON' },
        totalAmount: 200,
        dealCount: 2,
      },
    ]);

    await expect(
      service.revenue({ organizationId: 'org-1', groupBy: 'stage' }),
    ).resolves.toEqual({
      availability: 'AVAILABLE',
      groupBy: 'stage',
      range: { from: undefined, to: undefined },
      currencies: [
        {
          currency: 'USD',
          totalAmount: 100,
          dealCount: 1,
          items: [{ key: 'OPEN', amount: 100, dealCount: 1 }],
        },
        {
          currency: 'EUR',
          totalAmount: 200,
          dealCount: 2,
          items: [{ key: 'WON', amount: 200, dealCount: 2 }],
        },
      ],
    });
  });
});
