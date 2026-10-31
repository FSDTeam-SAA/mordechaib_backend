import { RoiDashboardSnapshot } from './roi-dashboard.types';
import { RoiReportService } from './roi-report.service';

describe('RoiReportService', () => {
  it('renders a valid PDF buffer from the same dashboard snapshot', async () => {
    const service = new RoiReportService();
    const snapshot = {
      organization: { id: 'org-1', name: 'Example Org' },
      asOf: '2026-10-31T06:00:00.000Z',
      timezone: 'Asia/Dhaka',
      range: {
        key: '30_DAYS',
        start: '2026-10-01T18:00:00.000Z',
        end: '2026-10-31T18:00:00.000Z',
        days: 30,
      },
      configuration: {
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
      },
      cards: {
        tasksAutomated: { total: 10 },
        meetingsAutoScheduled: { total: 4 },
        hoursSaved: { value: 5 },
        moneySaved: { amount: 125, currency: 'USD' },
      },
      projection: {
        projectedHoursSaved: 6,
        projectedMoneySaved: 150,
        currency: 'USD',
      },
      savingsTrend: [],
      growthOverview: {},
      tasksByAgent: {},
      timeSavedByCategory: [
        {
          label: 'Task Creation',
          availability: 'AVAILABLE',
          count: 10,
          hoursSaved: 2.5,
          moneySaved: 62.5,
          currency: 'USD',
        },
      ],
      savingsBreakdown: {},
      crmRevenue: { availability: 'UNAVAILABLE', currencies: [] },
    } as RoiDashboardSnapshot;

    const report = await service.create(snapshot);

    expect(report.subarray(0, 5).toString()).toBe('%PDF-');
    expect(report.length).toBeGreaterThan(1000);
  });
});
