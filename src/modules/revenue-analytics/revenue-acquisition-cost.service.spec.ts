import { RevenueAcquisitionCostRepository } from './revenue-acquisition-cost.repository';
import { RevenueAcquisitionCostService } from './revenue-acquisition-cost.service';
import {
  RevenueAcquisitionChannel,
  RevenueAnalyticsAvailability,
} from './revenue-analytics.enums';
import { AuditLogsService } from '../audit-logs/audit-logs.service';

describe('RevenueAcquisitionCostService', () => {
  const audits = {
    create: jest.fn().mockResolvedValue(undefined),
  } as unknown as AuditLogsService;

  beforeEach(() => jest.clearAllMocks());

  it('creates and audits a platform acquisition cost entry', async () => {
    const repository = {
      findDuplicate: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({
        _id: 'cost-1',
        period: '2026-11',
        channel: RevenueAcquisitionChannel.REFERRAL,
        salesCostUsd: 10,
        marketingCostUsd: 20,
        currency: 'USD',
        createdAt: new Date('2026-11-01T00:00:00.000Z'),
        updatedAt: new Date('2026-11-01T00:00:00.000Z'),
      }),
    } as unknown as RevenueAcquisitionCostRepository;
    const service = new RevenueAcquisitionCostService(repository, audits);

    const result = await service.create('admin-1', {
      period: '2026-11',
      channel: RevenueAcquisitionChannel.REFERRAL,
      salesCostUsd: 10,
      marketingCostUsd: 20,
    });

    expect(result).toMatchObject({ id: 'cost-1', totalCostUsd: 30 });
    expect(audits.create).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'PLATFORM',
        userId: 'admin-1',
        action: 'REVENUE_ACQUISITION_COST_CREATED',
        resourceId: 'cost-1',
      }),
    );
  });

  it('prorates monthly costs and exposes channel breakdown', async () => {
    const repository = {
      findPeriods: jest.fn().mockResolvedValue([
        {
          period: '2026-11',
          channel: RevenueAcquisitionChannel.PAID_SEARCH,
          salesCostUsd: 300,
          marketingCostUsd: 600,
        },
      ]),
    } as unknown as RevenueAcquisitionCostRepository;
    const service = new RevenueAcquisitionCostService(repository, audits);

    const result = await service.analytics(
      new Date('2026-11-01T00:00:00.000Z'),
      new Date('2026-11-16T00:00:00.000Z'),
      'UTC',
      3,
    );

    expect(result).toMatchObject({
      salesCostUsd: 150,
      marketingCostUsd: 300,
      totalCostUsd: 450,
      newlyAcquiredOrganizations: 3,
      coveredMonths: 1,
      expectedMonths: 1,
      availability: RevenueAnalyticsAvailability.AVAILABLE,
    });
    expect(result.channels[0]).toMatchObject({
      channel: RevenueAcquisitionChannel.PAID_SEARCH,
      totalCostUsd: 450,
    });
  });

  it('marks an incomplete multi-month range partial', async () => {
    const repository = {
      findPeriods: jest.fn().mockResolvedValue([
        {
          period: '2026-10',
          channel: RevenueAcquisitionChannel.REFERRAL,
          salesCostUsd: 10,
          marketingCostUsd: 20,
        },
      ]),
    } as unknown as RevenueAcquisitionCostRepository;
    const result = await new RevenueAcquisitionCostService(
      repository,
      audits,
    ).analytics(
      new Date('2026-10-01T00:00:00.000Z'),
      new Date('2026-12-01T00:00:00.000Z'),
      'UTC',
      1,
    );

    expect(result).toMatchObject({
      coveredMonths: 1,
      expectedMonths: 2,
      availability: RevenueAnalyticsAvailability.PARTIAL,
    });
  });
});
