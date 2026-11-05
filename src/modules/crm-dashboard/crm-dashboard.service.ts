import { Injectable } from '@nestjs/common';
import { OrganizerDashboardService } from '../organizer-dashboard/organizer-dashboard.service';
import {
  crmDashboardPeriodConfiguration,
  GetCrmDashboardSummaryQueryDto,
} from './dto/get-crm-dashboard-summary-query.dto';

@Injectable()
export class CrmDashboardService {
  constructor(
    private readonly organizerDashboard: OrganizerDashboardService,
  ) {}

  async summary(
    organizationId: string,
    userId: string,
    query: GetCrmDashboardSummaryQueryDto,
    now = new Date(),
  ) {
    const period = crmDashboardPeriodConfiguration(query.period);
    const summary = await this.organizerDashboard.summary(
      organizationId,
      userId,
      { days: period.days },
      now,
    );

    return {
      organizationId,
      asOf: now.toISOString(),
      timezone: summary.timezone,
      period: {
        key: query.period,
        start: summary.range.start,
        end: summary.range.end,
        days: period.days,
      },
      cards: {
        moneySaved: summary.cards.moneySaved,
        tasksToday: summary.cards.tasksToday,
        hoursSaved: summary.cards.hoursSaved,
        meetingsScheduled: summary.cards.meetingsScheduled,
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
