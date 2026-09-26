import { BadRequestException, Injectable } from '@nestjs/common';
import { CrmProviderType } from '../../common/types/crm-provider.interface';
import { CrmDealsRepository } from './crm-deals.repository';

@Injectable()
export class CrmAnalyticsService {
  constructor(private readonly deals: CrmDealsRepository) {}

  async revenue(input: {
    organizationId: string;
    provider?: CrmProviderType;
    groupBy: 'stage' | 'month';
    from?: string;
    to?: string;
  }) {
    const from = input.from ? this.date(input.from, 'from') : undefined;
    const to = input.to ? this.date(input.to, 'to') : undefined;
    if (from && to && from > to) {
      throw new BadRequestException('from must be before or equal to to');
    }
    const rows = await this.deals.aggregateRevenue({
      organizationId: input.organizationId,
      provider: input.provider,
      groupBy: input.groupBy,
      from,
      to,
    });
    const byCurrency = new Map<
      string,
      Array<{ key: string; amount: number; dealCount: number }>
    >();
    for (const row of rows) {
      const currency = row._id.currency || 'USD';
      const key =
        input.groupBy === 'stage'
          ? row._id.stage || 'OPEN'
          : row._id.month || 'unknown';
      const items = byCurrency.get(currency) || [];
      items.push({ key, amount: row.totalAmount, dealCount: row.dealCount });
      byCurrency.set(currency, items);
    }
    return {
      availability: rows.length ? 'AVAILABLE' : 'UNAVAILABLE',
      groupBy: input.groupBy,
      range: { from: from?.toISOString(), to: to?.toISOString() },
      currencies: [...byCurrency.entries()].map(([currency, items]) => ({
        currency,
        totalAmount: items.reduce((total, item) => total + item.amount, 0),
        dealCount: items.reduce((total, item) => total + item.dealCount, 0),
        items,
      })),
    };
  }

  private date(value: string, field: string) {
    const result = new Date(value);
    if (Number.isNaN(result.getTime())) {
      throw new BadRequestException(`${field} must be a valid ISO date`);
    }
    return result;
  }
}
