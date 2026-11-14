import { Injectable } from '@nestjs/common';
import { BriefingFactAvailability } from '../../common/enums/executive-briefing.enum';
import { AiActionType } from '../../database/schemas/ai-action-proposal.schema';
import { AiFact } from '../../common/helpers/ai-fact.helper';
import { RoiAnalyticsRepository } from './roi-analytics.repository';
import { RoiSettingsService } from './roi-settings.service';

type RoiBriefingFactGroup = {
  availability: BriefingFactAvailability;
  items: AiFact[];
};

type RoiBriefingInput = {
  organizationId: string;
  from: Date;
  to: Date;
  capturedAt: Date;
  organizationCurrency?: string;
};

@Injectable()
export class RoiBriefingFactsService {
  constructor(
    private readonly analytics: RoiAnalyticsRepository,
    private readonly settings: RoiSettingsService,
  ) {}

  async prepare(input: RoiBriefingInput): Promise<RoiBriefingFactGroup> {
    const effectiveTo = new Date(
      Math.max(
        input.from.getTime(),
        Math.min(input.to.getTime(), input.capturedAt.getTime()),
      ),
    );
    const durationMs = effectiveTo.getTime() - input.from.getTime();
    const previous = {
      from: new Date(input.from.getTime() - durationMs),
      to: input.from,
    };
    const [configuration, currentActivity, previousActivity] =
      await Promise.all([
        this.settings.get(input.organizationId, input.organizationCurrency),
        this.analytics.activity(
          input.organizationId,
          { from: input.from, to: effectiveTo },
          { from: input.from, to: effectiveTo },
          'UTC',
        ),
        durationMs > 0
          ? this.analytics.activity(
              input.organizationId,
              previous,
              previous,
              'UTC',
            )
          : Promise.resolve({ series: [], taskAgents: [] }),
      ]);

    const current = this.counts(currentActivity.series);
    const prior = this.counts(previousActivity.series);
    const categories = [
      {
        key: 'task-creation',
        title: 'Tasks automated',
        count: current.taskCreations,
        previousCount: prior.taskCreations,
        minutesPerAction: configuration.taskCreationMinutes,
      },
      {
        key: 'meeting-scheduling',
        title: 'Meetings auto-scheduled',
        count: current.meetingSchedules,
        previousCount: prior.meetingSchedules,
        minutesPerAction: configuration.meetingSchedulingMinutes,
      },
      {
        key: 'crm-update',
        title: 'CRM updates',
        count: current.crmUpdates,
        previousCount: prior.crmUpdates,
        minutesPerAction: configuration.crmUpdateMinutes,
      },
      {
        key: 'email-drafting',
        title: 'AI email drafts',
        count: current.emailDrafts,
        previousCount: prior.emailDrafts,
        minutesPerAction: configuration.emailDraftMinutes,
      },
    ];
    const totalMinutes = categories.reduce(
      (sum, category) => sum + category.count * category.minutesPerAction,
      0,
    );
    const previousMinutes = categories.reduce(
      (sum, category) =>
        sum + category.previousCount * category.minutesPerAction,
      0,
    );
    const moneySaved = this.money(totalMinutes, configuration.hourlyLaborCost);
    const previousMoneySaved = this.money(
      previousMinutes,
      configuration.hourlyLaborCost,
    );
    const periodKey = `${input.from.toISOString()}:${effectiveTo.toISOString()}`;
    const derivation =
      'Calculated from executed AI action proposals and persisted AI email drafts using the configured ROI methodology; values are estimates, not recognized revenue.';
    const fact = (
      key: string,
      title: string,
      data: Record<string, unknown>,
    ): AiFact => ({
      id: `roi-${key}-${periodKey}`,
      sourceType: 'DERIVED_ROI_METRIC',
      sourceId: `roi:${key}:${periodKey}`,
      capturedAt: input.capturedAt.toISOString(),
      data: { title, derivation, isEstimated: true, ...data },
    });

    return {
      availability: BriefingFactAvailability.AVAILABLE,
      items: [
        fact('summary', 'ROI and efficiency summary', {
          tasksAutomated: current.taskCreations,
          meetingsAutoScheduled: current.meetingSchedules,
          crmUpdates: current.crmUpdates,
          emailDrafts: current.emailDrafts,
          hoursSaved: Number((totalMinutes / 60).toFixed(2)),
          estimatedMoneySaved: moneySaved,
          currency: configuration.currency,
          previousPeriodHoursSaved: Number((previousMinutes / 60).toFixed(2)),
          previousPeriodEstimatedMoneySaved: previousMoneySaved,
          previousPeriodChangePercent: this.change(
            moneySaved,
            previousMoneySaved,
          ),
          period: {
            start: input.from.toISOString(),
            end: effectiveTo.toISOString(),
          },
          previousPeriod: {
            start: previous.from.toISOString(),
            end: previous.to.toISOString(),
          },
        }),
        ...categories.map((category) =>
          fact(category.key, category.title, {
            actionCount: category.count,
            previousPeriodActionCount: category.previousCount,
            minutesPerAction: category.minutesPerAction,
            hoursSaved: Number(
              ((category.count * category.minutesPerAction) / 60).toFixed(2),
            ),
            estimatedMoneySaved: this.money(
              category.count * category.minutesPerAction,
              configuration.hourlyLaborCost,
            ),
            currency: configuration.currency,
          }),
        ),
        fact('methodology', 'ROI methodology', {
          methodologyVersion: configuration.methodologyVersion,
          configurationSource: configuration.source,
          hourlyLaborCost: configuration.hourlyLaborCost,
          currency: configuration.currency,
          taskCreationMinutes: configuration.taskCreationMinutes,
          meetingSchedulingMinutes: configuration.meetingSchedulingMinutes,
          crmUpdateMinutes: configuration.crmUpdateMinutes,
          emailDraftMinutes: configuration.emailDraftMinutes,
        }),
      ],
    };
  }

  private counts(
    rows: Array<{ actionType: AiActionType | 'EMAIL_DRAFT'; count: number }>,
  ) {
    const result = {
      taskCreations: 0,
      meetingSchedules: 0,
      crmUpdates: 0,
      emailDrafts: 0,
    };
    for (const row of rows) {
      if (row.actionType === AiActionType.CREATE_TASK)
        result.taskCreations += row.count;
      if (row.actionType === AiActionType.SCHEDULE_MEETING)
        result.meetingSchedules += row.count;
      if (row.actionType === AiActionType.UPDATE_CRM_RECORD)
        result.crmUpdates += row.count;
      if (row.actionType === 'EMAIL_DRAFT') result.emailDrafts += row.count;
    }
    return result;
  }

  private money(minutes: number, hourlyCost: number) {
    return Number(((minutes / 60) * hourlyCost).toFixed(2));
  }

  private change(current: number, previous: number): number | null {
    if (!previous) return current ? null : 0;
    return Number((((current - previous) / previous) * 100).toFixed(2));
  }
}
