import { BriefingFactAvailability } from '../../common/enums/executive-briefing.enum';
import { IntegrationProvider } from '../../database/schemas/integration.schema';
import { CrmAnalyticsService } from './crm-analytics.service';
import { CrmBriefingFactsService } from './crm-briefing-facts.service';
import { CrmDealsRepository } from './crm-deals.repository';
import { CrmRecordsRepository } from './crm-records.repository';
import { CrmRepository } from './crm.repository';

describe('CrmBriefingFactsService', () => {
  const from = new Date('2026-10-01T00:00:00.000Z');
  const to = new Date('2026-10-08T00:00:00.000Z');
  const connection = {
    provider: IntegrationProvider.SALESFORCE,
    metadata: {
      lastSyncedAt: '2026-10-07T12:00:00.000Z',
      syncStatus: 'IDLE',
      objectSync: {
        configuration: {
          schemaVersion: '1.0',
          objects: [
            {
              objectType: 'Contact',
              fields: ['Name', 'Email', 'Health_Score__c', 'access_token'],
            },
          ],
        },
        objects: [{ objectType: 'Contact', status: 'SYNCHRONIZED' }],
      },
    },
  };
  const repositories = {
    connections: { findDefaultConnected: jest.fn() },
    deals: { findForBriefing: jest.fn() },
    records: { findForBriefing: jest.fn() },
    analytics: { revenue: jest.fn() },
  };
  const service = new CrmBriefingFactsService(
    repositories.connections as unknown as CrmRepository,
    repositories.deals as unknown as CrmDealsRepository,
    repositories.records as unknown as CrmRecordsRepository,
    repositories.analytics as unknown as CrmAnalyticsService,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    repositories.connections.findDefaultConnected.mockResolvedValue(connection);
    repositories.deals.findForBriefing.mockResolvedValue([
      {
        _id: 'deal-local-id',
        externalId: '006-provider-id',
        name: 'Enterprise renewal',
        amount: 125000,
        currency: 'USD',
        providerStage: 'Proposal',
        stageCategory: 'OPEN',
        closeDate: new Date('2026-10-20T00:00:00.000Z'),
        syncedAt: new Date('2026-10-07T12:00:00.000Z'),
        updatedAt: new Date('2026-10-07T12:00:00.000Z'),
      },
    ]);
    repositories.records.findForBriefing.mockResolvedValue([
      {
        _id: 'record-local-id',
        objectType: 'Contact',
        externalId: '003-provider-id',
        properties: {
          Name: 'Ayesha Rahman',
          Email: 'ayesha@example.com',
          Health_Score__c: 82,
          access_token: 'must-not-leak',
          Unselected_Field__c: 'must-not-leak',
        },
        associations: { accounts: ['001-provider-id'] },
        syncedAt: new Date('2026-10-07T12:00:00.000Z'),
        updatedAt: new Date('2026-10-07T12:00:00.000Z'),
      },
    ]);
    repositories.analytics.revenue.mockResolvedValue({
      availability: 'AVAILABLE',
      groupBy: 'stage',
      range: { from: from.toISOString(), to: to.toISOString() },
      currencies: [
        {
          currency: 'USD',
          totalAmount: 125000,
          dealCount: 1,
          items: [{ key: 'OPEN', amount: 125000, dealCount: 1 }],
        },
      ],
    });
  });

  it('projects default-provider CRM data into bounded sales and customer facts', async () => {
    const result = await service.prepare({
      organizationId: 'org-1',
      from,
      to,
    });

    expect(result.sales.availability).toBe(BriefingFactAvailability.AVAILABLE);
    expect(result.sales.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ sourceType: 'CRM_REVENUE_AGGREGATE' }),
        expect.objectContaining({
          sourceType: 'CRM_DEAL',
          sourceId: 'deal-local-id',
        }),
      ]),
    );
    expect(result.customers.availability).toBe(
      BriefingFactAvailability.AVAILABLE,
    );
    expect(result.customers.items[0].data.properties).toEqual({
      Name: 'Ayesha Rahman',
      Email: 'ayesha@example.com',
      Health_Score__c: 82,
    });
    expect(repositories.records.findForBriefing).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: IntegrationProvider.SALESFORCE,
        objectTypes: ['Contact'],
      }),
    );
  });

  it('keeps CRM facts unavailable when no default CRM is connected', async () => {
    repositories.connections.findDefaultConnected.mockResolvedValue(null);

    await expect(
      service.prepare({ organizationId: 'org-1', from, to }),
    ).resolves.toEqual({
      sales: {
        availability: BriefingFactAvailability.UNAVAILABLE,
        items: [],
      },
      customers: {
        availability: BriefingFactAvailability.UNAVAILABLE,
        items: [],
      },
    });
    expect(repositories.analytics.revenue).not.toHaveBeenCalled();
  });

  it('marks customer data partial until configured customer objects finish syncing', async () => {
    repositories.connections.findDefaultConnected.mockResolvedValue({
      ...connection,
      metadata: {
        ...connection.metadata,
        objectSync: {
          ...connection.metadata.objectSync,
          objects: [{ objectType: 'Contact', status: 'FAILED' }],
        },
      },
    });

    const result = await service.prepare({
      organizationId: 'org-1',
      from,
      to,
    });

    expect(result.customers.availability).toBe(
      BriefingFactAvailability.PARTIAL,
    );
  });
});
