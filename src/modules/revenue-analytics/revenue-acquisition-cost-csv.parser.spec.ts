import { RevenueAcquisitionChannel } from './revenue-analytics.enums';
import { parseRevenueAcquisitionCostCsv } from './revenue-acquisition-cost-csv.parser';

describe('parseRevenueAcquisitionCostCsv', () => {
  it('normalizes channels and parses USD costs', () => {
    const result = parseRevenueAcquisitionCostCsv(
      Buffer.from(
        'period,channel,sales_cost_usd,marketing_cost_usd,notes\n2026-11,Paid Search,1200.50,3000,"Launch, search"',
      ),
    );
    expect(result).toEqual([
      {
        period: '2026-11',
        channel: RevenueAcquisitionChannel.PAID_SEARCH,
        salesCostUsd: 1200.5,
        marketingCostUsd: 3000,
        notes: 'Launch, search',
      },
    ]);
  });

  it('rejects duplicate period/channel rows before any database write', () => {
    expect(() =>
      parseRevenueAcquisitionCostCsv(
        Buffer.from(
          'period,channel,sales_cost_usd,marketing_cost_usd\n2026-11,REFERRAL,1,2\n2026-11,REFERRAL,3,4',
        ),
      ),
    ).toThrow('duplicates an earlier period and channel');
  });

  it('rejects unsupported currencies represented as invalid cost values', () => {
    expect(() =>
      parseRevenueAcquisitionCostCsv(
        Buffer.from(
          'period,channel,sales_cost_usd,marketing_cost_usd\n2026-11,OTHER,USD 10,20',
        ),
      ),
    ).toThrow('invalid USD cost');
  });
});
