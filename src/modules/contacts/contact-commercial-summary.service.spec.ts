import { CustomerLeadStatus } from '../../common/enums/customer-lead-status.enum';
import { CrmDealStageCategory } from '../../database/schemas/crm-deal.schema';
import { ContactCommercialSummaryService } from './contact-commercial-summary.service';

describe('ContactCommercialSummaryService', () => {
  const service = new ContactCommercialSummaryService();

  it('builds currency-safe grounded commercial metrics', () => {
    const result = service.build({
      profile: { leadStatus: CustomerLeadStatus.QUALIFIED },
      crmLinks: [
        {
          provider: 'HUBSPOT',
          externalId: 'deal-1',
          record: { properties: { hs_deal_stage_probability: '0.75' } },
        },
        {
          provider: 'HUBSPOT',
          externalId: 'deal-2',
          record: { properties: { hs_deal_stage_probability: '50' } },
        },
      ],
      deals: [
        {
          _id: 'local-1',
          provider: 'HUBSPOT',
          externalId: 'deal-1',
          amount: 300,
          currency: 'USD',
          stageCategory: CrmDealStageCategory.OPEN,
          closeDate: '2026-12-01T00:00:00.000Z',
        },
        {
          _id: 'local-2',
          provider: 'HUBSPOT',
          externalId: 'deal-2',
          amount: 100,
          currency: 'USD',
          stageCategory: CrmDealStageCategory.OPEN,
          closeDate: '2026-11-20T00:00:00.000Z',
        },
      ],
      latestHealth: {
        healthScore: 82,
        riskLevel: 'LOW',
        analysisConfidence: 0.9,
        capturedAt: new Date('2026-11-12T00:00:00.000Z'),
      },
    });

    expect(result.commercial.dealValue).toEqual(
      expect.objectContaining({ value: 400, currency: 'USD', dealCount: 2 }),
    );
    expect(result.commercial.closeProbability).toEqual(
      expect.objectContaining({ value: 68.75, availability: 'AVAILABLE' }),
    );
    expect(result.commercial.expectedClose).toEqual(
      expect.objectContaining({ value: '2026-11-20T00:00:00.000Z' }),
    );
    expect(result.insights.qualification).toEqual(
      expect.objectContaining({
        value: CustomerLeadStatus.QUALIFIED,
        isAiGenerated: false,
      }),
    );
    expect(result.insights.risk).toEqual(
      expect.objectContaining({ level: 'LOW', healthScore: 82 }),
    );
  });

  it('does not combine currencies or invent unsupported insight fields', () => {
    const result = service.build({
      profile: {},
      crmLinks: [],
      deals: [
        {
          _id: 'one',
          provider: 'HUBSPOT',
          externalId: 'one',
          amount: 100,
          currency: 'USD',
          stageCategory: CrmDealStageCategory.OPEN,
        },
        {
          _id: 'two',
          provider: 'SALESFORCE',
          externalId: 'two',
          amount: 200,
          currency: 'EUR',
          stageCategory: CrmDealStageCategory.OPEN,
        },
      ],
      latestHealth: null,
    });

    expect(result.commercial.dealValue).toEqual(
      expect.objectContaining({
        aggregateAvailable: false,
        value: null,
        currency: null,
      }),
    );
    expect(result.commercial.expansionPotential.availability).toBe(
      'UNAVAILABLE',
    );
    expect(result.commercial.lifetimeValue.availability).toBe('UNAVAILABLE');
    expect(result.insights.nextBestAction.availability).toBe('UNAVAILABLE');
  });
});
