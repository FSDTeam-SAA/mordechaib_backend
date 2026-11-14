import { BadRequestException } from '@nestjs/common';
import { AUDIT_ACTION } from '../../common/constants/audit-action.constants';
import { CustomerContactStatus } from '../../common/enums/customer-contact-status.enum';
import { OrganizationStatus } from '../../common/enums/organization-status.enum';
import { SubscriptionStatus } from '../../common/enums/subscription-status.enum';
import { UserRole } from '../../common/enums/user-role.enum';
import { AdminSubscriptionDisplayStatus } from './admin-organization-contract';
import { OrganizationsAdminService } from './organizations-admin.service';

describe('OrganizationsAdminService list contract', () => {
  let organizations: { aggregate: jest.Mock };
  let audits: {
    countByActions: jest.Mock;
    countByOrganizationAndAction: jest.Mock;
  };
  let service: OrganizationsAdminService;

  beforeEach(() => {
    organizations = { aggregate: jest.fn() };
    audits = {
      countByActions: jest.fn().mockResolvedValue({}),
      countByOrganizationAndAction: jest.fn().mockResolvedValue(0),
    };
    service = new OrganizationsAdminService(
      organizations as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      audits as never,
    );
  });

  it('rejects ambiguous raw and effective subscription filters', async () => {
    await expect(
      service.list({
        subscriptionStatus: SubscriptionStatus.ACTIVE,
        subscriptionDisplayStatus: AdminSubscriptionDisplayStatus.PAUSED,
        timezone: 'UTC',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(organizations.aggregate).not.toHaveBeenCalled();
  });

  it('builds an escaped organization and owner search stage', async () => {
    mockListAggregations();

    await service.list({ search: 'owner.+', timezone: 'UTC' });

    const pipeline = organizations.aggregate.mock.calls[0][0] as Array<{
      $match?: Record<string, unknown>;
    }>;
    const searchStage = pipeline.find((stage) =>
      Array.isArray(stage.$match?.$or),
    );
    const matches = searchStage?.$match?.$or as Array<Record<string, unknown>>;
    const pattern = matches[0].name;
    const ownerMatch = (
      matches[3].members as {
        $elemMatch: Record<string, unknown>;
      }
    ).$elemMatch;
    expect(pattern).toEqual({ $regex: 'owner\\.\\+', $options: 'i' });
    expect(ownerMatch).toEqual(
      expect.objectContaining({
        role: 'OWNER',
        $or: expect.arrayContaining([
          { firstName: pattern },
          { lastName: pattern },
          { email: pattern },
          { phoneNumber: pattern },
        ]),
      }),
    );
  });

  it('filters PAUSED using the effective future pause timestamp', async () => {
    mockListAggregations();

    await service.list({
      subscriptionDisplayStatus: AdminSubscriptionDisplayStatus.PAUSED,
      timezone: 'UTC',
    });

    const pipeline = organizations.aggregate.mock.calls[0][0] as Array<{
      $match?: Record<string, unknown>;
    }>;
    const pausedStage = pipeline.find(
      (stage) =>
        (
          stage.$match?.['subscription.pausedUntil'] as
            { $gt?: unknown } | undefined
        )?.$gt,
    );
    expect(
      (
        pausedStage?.$match?.['subscription.pausedUntil'] as {
          $gt: unknown;
        }
      ).$gt,
    ).toBeInstanceOf(Date);
  });

  it('returns measured summary comparisons and timezone-aware today counts', async () => {
    organizations.aggregate
      .mockResolvedValueOnce([{ items: [], total: [] }])
      .mockResolvedValueOnce([
        {
          totalOrganizations: 100,
          activeOrganizations: 80,
          suspendedOrganizations: 20,
          createdCurrentPeriod: 10,
        },
      ]);
    audits.countByActions
      .mockResolvedValueOnce({
        ORGANIZATION_SUSPENDED_BY_PLATFORM_ADMIN: 3,
        ORGANIZATION_RESUMED_BY_PLATFORM_ADMIN: 1,
      })
      .mockResolvedValueOnce({
        ORGANIZATION_SUSPENDED_BY_PLATFORM_ADMIN: 2,
      });

    const result = await service.list({ timezone: 'Asia/Dhaka' });

    expect(result.summary).toMatchObject({
      timezone: 'Asia/Dhaka',
      totalOrganizations: 100,
      activeOrganizations: 80,
      suspendedOrganizations: 20,
      suspendedToday: 2,
      comparisons: {
        totalOrganizations: { previous: 90, absoluteChange: 10 },
        activeOrganizations: { previous: 72, absoluteChange: 8 },
        suspendedOrganizations: { previous: 18, absoluteChange: 2 },
      },
    });
    expect(audits.countByActions).toHaveBeenCalledTimes(2);
  });

  function mockListAggregations() {
    organizations.aggregate
      .mockResolvedValueOnce([{ items: [], total: [] }])
      .mockResolvedValueOnce([
        {
          totalOrganizations: 0,
          activeOrganizations: 0,
          suspendedOrganizations: 0,
          createdCurrentPeriod: 0,
        },
      ]);
  }
});

describe('OrganizationsAdminService detail metrics', () => {
  it('returns measured task, deduplicated meeting, customer, and ROI report counts', async () => {
    const organizationId = 'organization-1';
    const organizations = {
      findById: jest.fn().mockReturnValue(
        queryResult({
          _id: organizationId,
          name: 'Acme Corp',
          status: OrganizationStatus.ACTIVE,
          isInternal: false,
          timezone: 'Asia/Dhaka',
          language: 'en',
          createdAt: new Date('2026-11-01T00:00:00.000Z'),
        }),
      ),
    };
    const users = {
      find: jest.fn().mockReturnValue(
        sortedQueryResult([
          {
            _id: 'owner-1',
            firstName: 'Amina',
            lastName: 'Rahman',
            email: 'amina@example.com',
            role: UserRole.OWNER,
          },
        ]),
      ),
    };
    const subscriptions = {
      findOne: jest.fn().mockReturnValue(queryResult(null)),
    };
    const tasks = {
      countDocuments: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue(12),
      }),
    };
    const platformMeetings = {
      find: jest.fn().mockReturnValue(
        selectableQueryResult([
          {
            _id: 'meeting-1',
            calendarProvider: 'GOOGLE',
            calendarEventId: 'event-1',
          },
          { _id: 'meeting-2' },
        ]),
      ),
    };
    const calendarEvents = {
      find: jest.fn().mockReturnValue(
        selectableQueryResult([
          { _id: 'calendar-1', provider: 'GOOGLE', providerEventId: 'event-1' },
          { _id: 'calendar-2', provider: 'GOOGLE', providerEventId: 'event-2' },
        ]),
      ),
    };
    const customerContacts = {
      countDocuments: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue(150),
      }),
    };
    const integrations = {
      findOrganizationOverview: jest.fn().mockResolvedValue({
        organizationId,
        summary: {
          total: 11,
          connected: 2,
          attentionRequired: 0,
          notConfigured: 9,
        },
        items: [],
      }),
    };
    const audits = {
      countByOrganizationAndAction: jest.fn().mockResolvedValue(28),
    };
    const service = new OrganizationsAdminService(
      organizations as never,
      users as never,
      subscriptions as never,
      tasks as never,
      platformMeetings as never,
      calendarEvents as never,
      customerContacts as never,
      {} as never,
      {} as never,
      {} as never,
      integrations as never,
      {} as never,
      audits as never,
    );

    const result = await service.getById(organizationId);

    expect(result.metrics).toEqual({
      tasksCreated: { availability: 'AVAILABLE', value: 12 },
      meetings: { availability: 'AVAILABLE', value: 3 },
      crmContacts: {
        availability: 'AVAILABLE',
        value: 150,
        scope: 'ACTIVE_CUSTOMER_CONTACTS',
        source: 'NOLTRA_CUSTOMER_CONTACTS',
      },
      roiReports: {
        availability: 'AVAILABLE',
        value: 28,
        scope: 'GENERATED_PDF_REPORTS',
        source: 'AUDIT_LOG',
      },
    });
    expect(customerContacts.countDocuments).toHaveBeenCalledWith({
      organizationId,
      status: CustomerContactStatus.ACTIVE,
    });
    expect(audits.countByOrganizationAndAction).toHaveBeenCalledWith(
      organizationId,
      AUDIT_ACTION.ROI_REPORT_GENERATED,
    );
    expect(integrations.findOrganizationOverview).toHaveBeenCalledWith(
      organizationId,
    );
  });
});

function queryResult<T>(value: T) {
  return {
    lean: jest.fn().mockReturnValue({
      exec: jest.fn().mockResolvedValue(value),
    }),
  };
}

function sortedQueryResult<T>(value: T) {
  const exec = jest.fn().mockResolvedValue(value);
  const lean = jest.fn().mockReturnValue({ exec });
  const sort = jest.fn().mockReturnValue({ lean });
  return { select: jest.fn().mockReturnValue({ sort }) };
}

function selectableQueryResult<T>(value: T) {
  const exec = jest.fn().mockResolvedValue(value);
  const lean = jest.fn().mockReturnValue({ exec });
  return { select: jest.fn().mockReturnValue({ lean }) };
}
