import { Injectable } from '@nestjs/common';
import { OrganizerDashboardService } from '../organizer-dashboard/organizer-dashboard.service';
import { RoiDashboardService } from '../roi-dashboard/roi-dashboard.service';
import {
  crmDashboardPeriodConfiguration,
  GetCrmDashboardSummaryQueryDto,
} from './dto/get-crm-dashboard-summary-query.dto';

@Injectable()
export class CrmDashboardService {
  constructor(
    private readonly organizerDashboard: OrganizerDashboardService,
    private readonly roiDashboard: RoiDashboardService,
  ) {}

  async summary(
    organizationId: string,
    userId: string,
    query: GetCrmDashboardSummaryQueryDto,
    now = new Date(),
  ) {
    const period = crmDashboardPeriodConfiguration(query.period);
    const [measured, roi] = await Promise.all([
      this.organizerDashboard.summary(
        organizationId,
        userId,
        { days: period.days },
        now,
      ),
      this.roiDashboard.dashboard(
        organizationId,
        { range: period.roiRange },
        now,
      ),
    ]);

    return {
      organizationId,
      asOf: now.toISOString(),
      timezone: measured.timezone,
      period: {
        key: query.period,
        start: measured.range.start,
        end: measured.range.end,
        days: period.days,
      },
      cards: {
        moneySaved: roi.cards.moneySaved,
        tasksToday: measured.cards.tasksToday,
        hoursSaved: roi.cards.hoursSaved,
        meetingsScheduled: measured.cards.meetingsScheduled,
      },
      methodology: {
        moneySaved: 'CONFIGURED_ESTIMATE',
        tasksToday: 'MEASURED',
        hoursSaved: 'CONFIGURED_ESTIMATE',
        meetingsScheduled: 'MEASURED',
      },
    };
  }
}
