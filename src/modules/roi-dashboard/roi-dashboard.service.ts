import { Injectable } from '@nestjs/common';
import {
  localDateKeys,
  trailingLocalDaysRange,
} from '../../common/helpers/local-date-range.helper';
import { AiActionType } from '../../database/schemas/ai-action-proposal.schema';
import { CrmAnalyticsService } from '../crm/crm-analytics.service';
import { OrganizationsService } from '../organizations/organizations.service';
import {
  GetRoiDashboardQueryDto,
  roiRangeDays,
} from './dto/get-roi-dashboard-query.dto';
import {
  RoiActionCounts,
  RoiConfigurationView,
  RoiDashboardSnapshot,
} from './roi-dashboard.types';
import {
  RoiActionSeriesRow,
  RoiAnalyticsRepository,
} from './roi-analytics.repository';
import { RoiSettingsService } from './roi-settings.service';

type DailyRoiActivity = RoiActionCounts & { date: string };

type PeriodMetrics = {
  counts: RoiActionCounts;
  minutesSaved: number;
  hoursSaved: number;
  moneySaved: number;
};

@Injectable()
export class RoiDashboardService {
  constructor(
    private readonly analytics: RoiAnalyticsRepository,
    private readonly settings: RoiSettingsService,
    private readonly organizations: OrganizationsService,
    private readonly crmAnalytics: CrmAnalyticsService,
  ) {}

  async dashboard(
    organizationId: string,
    query: GetRoiDashboardQueryDto,
    now = new Date(),
  ): Promise<RoiDashboardSnapshot> {
    const organization = await this.organizations.findCurrent(organizationId);
    const timezone = organization.timezone || 'UTC';
    const days = roiRangeDays(query.range);
    const currentRange = trailingLocalDaysRange(now, timezone, days);
    const previousRange = trailingLocalDaysRange(
      new Date(currentRange.start.getTime() - 1),
      timezone,
      days,
    );
    const forecastHistoryRange = trailingLocalDaysRange(now, timezone, 30);
    const seriesStart = new Date(
      Math.min(
        previousRange.start.getTime(),
        forecastHistoryRange.start.getTime(),
      ),
    );
    const [configuration, activity, crmRevenue] = await Promise.all([
      this.settings.get(organizationId, organization.defaultCurrency),
      this.analytics.activity(
        organizationId,
        { from: seriesStart, to: currentRange.end },
        { from: currentRange.start, to: currentRange.end },
        timezone,
      ),
      this.crmAnalytics.revenue({
        organizationId,
        groupBy: 'stage',
        from: currentRange.start.toISOString(),
        to: new Date(currentRange.end.getTime() - 1).toISOString(),
      }),
    ]);
    const daily = this.dailyIndex(activity.series);
    const currentKeys = localDateKeys(currentRange.start, days, timezone);
    const previousKeys = localDateKeys(previousRange.start, days, timezone);
    const forecastKeys = localDateKeys(
      forecastHistoryRange.start,
      30,
      timezone,
    );
    const current = this.periodMetrics(currentKeys, daily, configuration);
    const previous = this.periodMetrics(previousKeys, daily, configuration);
    const forecastHistory = this.periodMetrics(
      forecastKeys,
      daily,
      configuration,
    );
    const savingsTrend = currentKeys.map((date) => {
      const activity = daily.get(date) || this.emptyDay(date);
      const metrics = this.metrics(activity, configuration);
      return {
        date,
        counts: this.counts(activity),
        minutesSaved: metrics.minutesSaved,
        hoursSaved: metrics.hoursSaved,
        moneySaved: metrics.moneySaved,
        currency: configuration.currency,
        isEstimated: true,
      };
    });
    const tasksByAgentTotal = activity.taskAgents.reduce(
      (sum, row) => sum + row.count,
      0,
    );
    const categories = this.categories(current.counts, configuration);

    return {
      organization: {
        id: organizationId,
        name: organization.name,
      },
      asOf: now.toISOString(),
      timezone,
      configuration,
      range: {
        key: query.range,
        start: currentRange.start.toISOString(),
        end: currentRange.end.toISOString(),
        days,
      },
      cards: {
        tasksAutomated: this.measuredCard(
          current.counts.taskCreations,
          previous.counts.taskCreations,
        ),
        meetingsAutoScheduled: this.measuredCard(
          current.counts.meetingSchedules,
          previous.counts.meetingSchedules,
        ),
        hoursSaved: {
          availability: 'AVAILABLE',
          value: current.hoursSaved,
          minutes: current.minutesSaved,
          isEstimated: true,
          comparison: this.comparison(
            current.minutesSaved,
            previous.minutesSaved,
          ),
        },
        moneySaved: {
          availability: 'AVAILABLE',
          amount: current.moneySaved,
          currency: configuration.currency,
          isEstimated: true,
          comparison: this.comparison(current.moneySaved, previous.moneySaved),
        },
      },
      projection: {
        availability: 'AVAILABLE',
        period: 'NEXT_30_DAYS',
        method: 'TRAILING_30_DAY_DAILY_AVERAGE',
        historyDays: 30,
        projectedMinutesSaved: forecastHistory.minutesSaved,
        projectedHoursSaved: forecastHistory.hoursSaved,
        projectedMoneySaved: forecastHistory.moneySaved,
        currency: configuration.currency,
        isEstimated: true,
      },
      savingsTrend,
      growthOverview: {
        tasksAutomated: currentKeys.map((date) => ({
          date,
          value: daily.get(date)?.taskCreations || 0,
        })),
        meetingsAutoScheduled: currentKeys.map((date) => ({
          date,
          value: daily.get(date)?.meetingSchedules || 0,
        })),
        comparison: {
          tasksAutomated: this.comparison(
            current.counts.taskCreations,
            previous.counts.taskCreations,
          ),
          meetingsAutoScheduled: this.comparison(
            current.counts.meetingSchedules,
            previous.counts.meetingSchedules,
          ),
        },
      },
      tasksByAgent: {
        availability: 'AVAILABLE',
        total: tasksByAgentTotal,
        averageScore: {
          availability: 'UNAVAILABLE',
          value: null,
          reason: 'AGENT_SCORE_METHODOLOGY_NOT_CONFIGURED',
        },
        items: activity.taskAgents.map((row) => ({
          ...row,
          percentage: tasksByAgentTotal
            ? this.round((row.count / tasksByAgentTotal) * 100)
            : 0,
        })),
      },
      timeSavedByCategory: categories,
      savingsBreakdown: {
        availability: 'AVAILABLE',
        currency: configuration.currency,
        isEstimated: true,
        items: categories,
        totalMinutesSaved: current.minutesSaved,
        totalHoursSaved: current.hoursSaved,
        totalMoneySaved: current.moneySaved,
      },
      crmRevenue: {
        ...crmRevenue,
        attribution: 'NONE',
        notice:
          'CRM revenue is business pipeline data and is not included in money saved.',
      },
    };
  }

  private dailyIndex(rows: RoiActionSeriesRow[]) {
    const values = new Map<string, DailyRoiActivity>();
    for (const row of rows) {
      const item = values.get(row.date) || this.emptyDay(row.date);
      if (row.actionType === AiActionType.CREATE_TASK) {
        item.taskCreations += row.count;
      } else if (row.actionType === AiActionType.SCHEDULE_MEETING) {
        item.meetingSchedules += row.count;
      } else if (row.actionType === AiActionType.UPDATE_CRM_RECORD) {
        item.crmUpdates += row.count;
      } else if (row.actionType === 'EMAIL_DRAFT') {
        item.emailDrafts += row.count;
      }
      values.set(row.date, item);
    }
    return values;
  }

  private periodMetrics(
    keys: string[],
    daily: Map<string, DailyRoiActivity>,
    configuration: RoiConfigurationView,
  ): PeriodMetrics {
    const counts = keys.reduce<RoiActionCounts>((total, date) => {
      const item = daily.get(date) || this.emptyDay(date);
      total.taskCreations += item.taskCreations;
      total.meetingSchedules += item.meetingSchedules;
      total.crmUpdates += item.crmUpdates;
      total.emailDrafts += item.emailDrafts;
      return total;
    }, this.emptyCounts());
    return { counts, ...this.metrics(counts, configuration) };
  }

  private metrics(
    counts: RoiActionCounts,
    configuration: RoiConfigurationView,
  ) {
    const minutesSaved = this.round(
      counts.taskCreations * configuration.taskCreationMinutes +
        counts.meetingSchedules * configuration.meetingSchedulingMinutes +
        counts.crmUpdates * configuration.crmUpdateMinutes +
        counts.emailDrafts * configuration.emailDraftMinutes,
    );
    const hoursSaved = this.round(minutesSaved / 60);
    const moneySaved = this.round(
      (minutesSaved / 60) * configuration.hourlyLaborCost,
    );
    return { minutesSaved, hoursSaved, moneySaved };
  }

  private categories(
    counts: RoiActionCounts,
    configuration: RoiConfigurationView,
  ) {
    const available = (
      key: string,
      label: string,
      count: number,
      minutesPerAction: number,
    ) => {
      const minutesSaved = this.round(count * minutesPerAction);
      return {
        key,
        label,
        availability: 'AVAILABLE',
        count,
        minutesPerAction,
        minutesSaved,
        hoursSaved: this.round(minutesSaved / 60),
        moneySaved: this.round(
          (minutesSaved / 60) * configuration.hourlyLaborCost,
        ),
        currency: configuration.currency,
        isEstimated: true,
      };
    };
    return [
      available(
        'TASK_CREATION',
        'Task Creation',
        counts.taskCreations,
        configuration.taskCreationMinutes,
      ),
      available(
        'MEETING_SCHEDULING',
        'Meeting Scheduling',
        counts.meetingSchedules,
        configuration.meetingSchedulingMinutes,
      ),
      available(
        'CRM_UPDATE',
        'CRM Updates',
        counts.crmUpdates,
        configuration.crmUpdateMinutes,
      ),
      available(
        'EMAIL_DRAFTING',
        'Email Drafting',
        counts.emailDrafts,
        configuration.emailDraftMinutes,
      ),
      {
        key: 'FOLLOW_UP',
        label: 'Follow-Ups',
        availability: 'UNAVAILABLE',
        count: null,
        minutesSaved: null,
        hoursSaved: null,
        moneySaved: null,
        currency: configuration.currency,
        isEstimated: true,
        reason: 'FOLLOW_UP_ACTIVITY_NOT_MODELLED',
      },
    ];
  }

  private measuredCard(current: number, previous: number) {
    return {
      availability: 'AVAILABLE',
      total: current,
      isEstimated: false,
      comparison: this.comparison(current, previous),
    };
  }

  private comparison(current: number, previous: number) {
    return {
      current,
      previous,
      changePercent:
        previous === 0
          ? current === 0
            ? 0
            : null
          : this.round(((current - previous) / previous) * 100),
    };
  }

  private emptyDay(date: string): DailyRoiActivity {
    return { date, ...this.emptyCounts() };
  }

  private emptyCounts(): RoiActionCounts {
    return {
      taskCreations: 0,
      meetingSchedules: 0,
      crmUpdates: 0,
      emailDrafts: 0,
    };
  }

  private counts(value: RoiActionCounts): RoiActionCounts {
    return {
      taskCreations: value.taskCreations,
      meetingSchedules: value.meetingSchedules,
      crmUpdates: value.crmUpdates,
      emailDrafts: value.emailDrafts,
    };
  }

  private round(value: number) {
    return Number(value.toFixed(2));
  }
}
