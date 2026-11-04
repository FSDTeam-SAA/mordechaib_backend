import { OrganizerDashboardService } from '../organizer-dashboard/organizer-dashboard.service';
import { RoiDashboardService } from '../roi-dashboard/roi-dashboard.service';
import { CrmDashboardService } from './crm-dashboard.service';
import { CrmDashboardPeriod } from './dto/get-crm-dashboard-summary-query.dto';

describe('CrmDashboardService', () => {
  const organizerDashboard = { summary: jest.fn() };
  const roiDashboard = { dashboard: jest.fn() };
  const service = new CrmDashboardService(
    organizerDashboard as unknown as OrganizerDashboardService,
    roiDashboard as unknown as RoiDashboardService,
  );

  beforeEach(() => jest.clearAllMocks());

  it('combines measured activity and configured ROI estimates', async () => {
    const now = new Date('2026-11-04T06:00:00.000Z');
    organizerDashboard.summary.mockResolvedValue({
      timezone: 'Asia/Dhaka',
      range: {
        start: '2026-10-29T18:00:00.000Z',
        end: '2026-11-05T18:00:00.000Z',
      },
      cards: {
        tasksToday: { availability: 'AVAILABLE', total: 12, overdue: 2 },
        meetingsScheduled: { availability: 'AVAILABLE', total: 5 },
      },
    });
    roiDashboard.dashboard.mockResolvedValue({
      cards: {
        moneySaved: {
          availability: 'AVAILABLE',
          amount: 300,
          currency: 'USD',
          isEstimated: true,
        },
        hoursSaved: {
          availability: 'AVAILABLE',
          value: 12,
          isEstimated: true,
        },
      },
    });

    const result = await service.summary(
      'org-1',
      'user-1',
      { period: CrmDashboardPeriod.DAYS_7 },
      now,
    );

    expect(result.cards).toEqual({
      moneySaved: expect.objectContaining({ amount: 300, isEstimated: true }),
      tasksToday: expect.objectContaining({ total: 12, overdue: 2 }),
      hoursSaved: expect.objectContaining({ value: 12, isEstimated: true }),
      meetingsScheduled: expect.objectContaining({ total: 5 }),
    });
    expect(organizerDashboard.summary).toHaveBeenCalledWith(
      'org-1',
      'user-1',
      { days: 7 },
      now,
    );
    expect(result.methodology).toEqual({
      moneySaved: 'CONFIGURED_ESTIMATE',
      tasksToday: 'MEASURED',
      hoursSaved: 'CONFIGURED_ESTIMATE',
      meetingsScheduled: 'MEASURED',
    });
  });
});
