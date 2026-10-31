import { AiActionType } from '../../database/schemas/ai-action-proposal.schema';
import { CrmAnalyticsService } from '../crm/crm-analytics.service';
import { OrganizationsService } from '../organizations/organizations.service';
import {
  GetRoiDashboardQueryDto,
  RoiDashboardRange,
} from './dto/get-roi-dashboard-query.dto';
import { RoiAnalyticsRepository } from './roi-analytics.repository';
import { RoiDashboardService } from './roi-dashboard.service';
import { RoiSettingsService } from './roi-settings.service';

describe('RoiDashboardService', () => {
  it('keeps measured activity separate from estimated savings and CRM revenue', async () => {
    const analytics = {
      activity: jest.fn().mockResolvedValue({
        series: [
          {
            date: '2026-10-30',
            actionType: AiActionType.CREATE_TASK,
            count: 2,
          },
          {
            date: '2026-10-30',
            actionType: AiActionType.SCHEDULE_MEETING,
            count: 1,
          },
          {
            date: '2026-10-30',
            actionType: AiActionType.UPDATE_CRM_RECORD,
            count: 2,
          },
          { date: '2026-10-30', actionType: 'EMAIL_DRAFT', count: 3 },
          {
            date: '2026-10-20',
            actionType: AiActionType.CREATE_TASK,
            count: 1,
          },
        ],
        taskAgents: [
          {
            agentId: 'agent-1',
            agentName: 'Laura',
            agentType: 'CHIEF_OF_STAFF',
            count: 2,
          },
        ],
      }),
    };
    const settings = {
      get: jest.fn().mockResolvedValue({
        organizationId: 'org-1',
        methodologyVersion: '1.0',
        source: 'PLATFORM_DEFAULT',
        isEstimated: true,
        taskCreationMinutes: 15,
        meetingSchedulingMinutes: 20,
        crmUpdateMinutes: 5,
        emailDraftMinutes: 10,
        hourlyLaborCost: 25,
        currency: 'USD',
        updatedAt: null,
      }),
    };
    const organizations = {
      findCurrent: jest.fn().mockResolvedValue({
        name: 'Example Org',
        timezone: 'UTC',
        defaultCurrency: 'USD',
      }),
    };
    const crm = {
      revenue: jest.fn().mockResolvedValue({
        availability: 'AVAILABLE',
        currencies: [
          { currency: 'USD', totalAmount: 50000, dealCount: 2, items: [] },
        ],
      }),
    };
    const service = new RoiDashboardService(
      analytics as unknown as RoiAnalyticsRepository,
      settings as unknown as RoiSettingsService,
      organizations as unknown as OrganizationsService,
      crm as unknown as CrmAnalyticsService,
    );

    const result = await service.dashboard(
      'org-1',
      { range: RoiDashboardRange.DAYS_7 } as GetRoiDashboardQueryDto,
      new Date('2026-10-31T12:00:00.000Z'),
    );

    expect(result.cards).toMatchObject({
      tasksAutomated: { total: 2, isEstimated: false },
      meetingsAutoScheduled: { total: 1, isEstimated: false },
      hoursSaved: { value: 1.5, minutes: 90, isEstimated: true },
      moneySaved: { amount: 37.5, currency: 'USD', isEstimated: true },
    });
    expect(result.tasksByAgent).toMatchObject({
      total: 2,
      items: [{ agentId: 'agent-1', count: 2, percentage: 100 }],
    });
    expect(result.timeSavedByCategory).toContainEqual(
      expect.objectContaining({
        key: 'FOLLOW_UP',
        availability: 'UNAVAILABLE',
      }),
    );
    expect(result.crmRevenue).toMatchObject({
      availability: 'AVAILABLE',
      attribution: 'NONE',
    });
  });
});
