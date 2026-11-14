import { AiActionType } from '../../database/schemas/ai-action-proposal.schema';
import { BriefingFactAvailability } from '../../common/enums/executive-briefing.enum';
import { RoiAnalyticsRepository } from './roi-analytics.repository';
import { RoiBriefingFactsService } from './roi-briefing-facts.service';
import { RoiSettingsService } from './roi-settings.service';

describe('RoiBriefingFactsService', () => {
  it('calculates exact-period estimates and an equal previous-period comparison', async () => {
    const analytics = {
      activity: jest
        .fn()
        .mockResolvedValueOnce({
          series: [
            { actionType: AiActionType.CREATE_TASK, count: 2 },
            { actionType: AiActionType.SCHEDULE_MEETING, count: 1 },
            { actionType: AiActionType.UPDATE_CRM_RECORD, count: 3 },
            { actionType: 'EMAIL_DRAFT', count: 2 },
          ],
          taskAgents: [],
        })
        .mockResolvedValueOnce({
          series: [{ actionType: AiActionType.CREATE_TASK, count: 1 }],
          taskAgents: [],
        }),
    } as unknown as RoiAnalyticsRepository;
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
        hourlyLaborCost: 30,
        currency: 'USD',
        updatedAt: null,
      }),
    } as unknown as RoiSettingsService;
    const service = new RoiBriefingFactsService(analytics, settings);

    const result = await service.prepare({
      organizationId: 'org-1',
      from: new Date('2026-11-09T00:00:00.000Z'),
      to: new Date('2026-11-16T00:00:00.000Z'),
      capturedAt: new Date('2026-11-14T00:00:00.000Z'),
    });

    expect(result.availability).toBe(BriefingFactAvailability.AVAILABLE);
    expect(analytics.activity).toHaveBeenNthCalledWith(
      1,
      'org-1',
      {
        from: new Date('2026-11-09T00:00:00.000Z'),
        to: new Date('2026-11-14T00:00:00.000Z'),
      },
      {
        from: new Date('2026-11-09T00:00:00.000Z'),
        to: new Date('2026-11-14T00:00:00.000Z'),
      },
      'UTC',
    );
    expect(result.items[0].data).toEqual(
      expect.objectContaining({
        tasksAutomated: 2,
        meetingsAutoScheduled: 1,
        crmUpdates: 3,
        emailDrafts: 2,
        hoursSaved: 1.42,
        estimatedMoneySaved: 42.5,
        previousPeriodHoursSaved: 0.25,
        previousPeriodEstimatedMoneySaved: 7.5,
        isEstimated: true,
      }),
    );
  });
});
