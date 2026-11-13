import { Injectable } from '@nestjs/common';
import { CrmDealStageCategory } from '../../database/schemas/crm-deal.schema';

type CrmLink = Record<string, unknown>;
type Deal = Record<string, unknown>;

@Injectable()
export class ContactCommercialSummaryService {
  build(input: {
    profile: Record<string, unknown>;
    crmLinks: CrmLink[];
    deals: Deal[];
    latestHealth: Record<string, unknown> | null;
  }) {
    const openDeals = input.deals.filter(
      (deal) => deal.stageCategory === CrmDealStageCategory.OPEN,
    );
    const amounts = this.amounts(openDeals);
    const expectedClose = this.expectedClose(openDeals);
    const probability = this.probability(openDeals, input.crmLinks);

    return {
      commercial: {
        dealValue: amounts.length
          ? {
              availability: 'AVAILABLE',
              aggregateAvailable: amounts.length === 1,
              value: amounts.length === 1 ? amounts[0].value : null,
              currency: amounts.length === 1 ? amounts[0].currency : null,
              breakdown: amounts,
              dealCount: openDeals.length,
            }
          : this.unavailable('No linked open CRM deal is available.'),
        closeProbability: probability,
        expectedClose: expectedClose
          ? {
              availability: 'AVAILABLE',
              value: expectedClose.value,
              dealId: expectedClose.dealId,
              source: 'CRM_DEAL',
            }
          : this.unavailable(
              'No close date is available on a linked open CRM deal.',
            ),
        expansionPotential: this.unavailable(
          'Expansion potential has no authoritative model or persisted source.',
        ),
        lifetimeValue: this.unavailable(
          'Customer lifetime value is not persisted or attributable yet.',
        ),
      },
      insights: {
        qualification: input.profile.leadStatus
          ? {
              availability: 'AVAILABLE',
              value: input.profile.leadStatus,
              source: 'CONTACT_PROFILE',
              isAiGenerated: false,
            }
          : this.unavailable('Customer lead status is not available.'),
        risk: input.latestHealth
          ? {
              availability: 'AVAILABLE',
              level: input.latestHealth.riskLevel,
              healthScore: input.latestHealth.healthScore,
              confidence: input.latestHealth.analysisConfidence ?? null,
              capturedAt: input.latestHealth.capturedAt,
              source: 'CUSTOMER_HEALTH_SNAPSHOT',
              isAiGenerated: true,
            }
          : this.unavailable('No persisted customer-health insight exists.'),
        predictedClose: expectedClose
          ? {
              availability: 'AVAILABLE',
              value: expectedClose.value,
              source: 'CRM_DEAL_CLOSE_DATE',
              isAiGenerated: false,
            }
          : this.unavailable('No linked CRM close date is available.'),
        nextBestAction: this.unavailable(
          'No grounded next-best-action result is persisted.',
        ),
      },
    };
  }

  private amounts(deals: Deal[]) {
    const totals = new Map<string, { value: number; dealCount: number }>();
    for (const deal of deals) {
      const amount = Number(deal.amount);
      if (!Number.isFinite(amount)) continue;
      const currency = String(deal.currency || 'USD').toUpperCase();
      const current = totals.get(currency) || { value: 0, dealCount: 0 };
      current.value += amount;
      current.dealCount += 1;
      totals.set(currency, current);
    }
    return [...totals.entries()]
      .map(([currency, value]) => ({ currency, ...value }))
      .sort((left, right) => left.currency.localeCompare(right.currency));
  }

  private expectedClose(deals: Deal[]) {
    return deals
      .map((deal) => ({
        dealId: String(deal._id || deal.id),
        value: this.date(deal.closeDate),
      }))
      .filter(
        (item): item is { dealId: string; value: string } =>
          item.value !== null,
      )
      .sort((left, right) => left.value.localeCompare(right.value))[0];
  }

  private probability(deals: Deal[], links: CrmLink[]) {
    const linkByIdentity = new Map(
      links.map((link) => [
        `${String(link.provider)}:${String(link.externalId)}`,
        link,
      ]),
    );
    const values = deals
      .map((deal) => {
        const link = linkByIdentity.get(
          `${String(deal.provider)}:${String(deal.externalId)}`,
        );
        const record = this.record(link?.record);
        const properties = this.record(record?.properties);
        const raw = this.first(properties, [
          'hs_deal_stage_probability',
          'probability',
          'Probability',
        ]);
        const probability = this.percent(raw);
        const amount = Number(deal.amount);
        return probability === null
          ? null
          : {
              probability,
              weight: Number.isFinite(amount) && amount > 0 ? amount : 1,
            };
      })
      .filter(
        (value): value is { probability: number; weight: number } =>
          value !== null,
      );
    if (!values.length) {
      return this.unavailable(
        'No explicit probability is available on linked open CRM deals.',
      );
    }
    const weight = values.reduce((sum, item) => sum + item.weight, 0);
    const weighted = values.reduce(
      (sum, item) => sum + item.probability * item.weight,
      0,
    );
    return {
      availability: values.length === deals.length ? 'AVAILABLE' : 'PARTIAL',
      value: Number((weighted / weight).toFixed(2)),
      unit: 'PERCENT',
      coverage: { withProbability: values.length, totalDeals: deals.length },
      source: 'CRM_RECORD_PROPERTIES',
    };
  }

  private percent(value: unknown) {
    if (value === null || value === undefined || value === '') return null;
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0) return null;
    const percent = parsed <= 1 ? parsed * 100 : parsed;
    return percent <= 100 ? percent : null;
  }

  private date(value: unknown) {
    if (!value) return null;
    const date = new Date(String(value));
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }

  private first(
    record: Record<string, unknown> | null,
    keys: string[],
  ): unknown {
    if (!record) return undefined;
    for (const key of keys) {
      if (record[key] !== undefined && record[key] !== null) return record[key];
    }
    return undefined;
  }

  private record(value: unknown) {
    return value && typeof value === 'object'
      ? (value as Record<string, unknown>)
      : null;
  }

  private unavailable(reason: string) {
    return { availability: 'UNAVAILABLE', reason };
  }
}
