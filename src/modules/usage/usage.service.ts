import { Injectable } from '@nestjs/common';
import { AddonCategory } from '../../common/enums/addon-category.enum';
import { AiUsageTelemetry } from '../../common/helpers/ai-usage-telemetry.helper';
import { resolveUsagePeriod } from '../../common/helpers/usage-period.helper';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { UsageRepository } from './usage.repository';

@Injectable()
export class UsageService {
  constructor(
    private readonly repository: UsageRepository,
    private readonly subscriptions: SubscriptionsService,
  ) {}

  async recordAiAction(input: {
    organizationId: string;
    sourceId: string;
    path: string;
    telemetry?: AiUsageTelemetry;
  }) {
    const { subscription } = await this.subscriptions.getMine(
      input.organizationId,
    );
    const period = this.period(subscription);
    return this.repository.createEvent({
      organizationId: input.organizationId,
      provider: 'AI_BACKEND',
      metric: 'AI_ACTIONS',
      sourceId: input.sourceId,
      quantity: 1,
      unit: 'ACTION',
      cost: input.telemetry?.costUsd,
      ...period,
      metadata: {
        path: input.path,
        ...(input.telemetry ?? {}),
        costMeasured: input.telemetry?.costUsd !== undefined,
      },
    });
  }

  async current(organizationId: string) {
    const { subscription, plan } =
      await this.subscriptions.getMine(organizationId);
    const { periodStart, periodEnd } = this.period(subscription);
    const rows = await this.repository.aggregatePeriod(
      organizationId,
      periodStart,
      periodEnd,
    );
    const aiActions = this.quantity(rows, 'AI_BACKEND', 'AI_ACTIONS');
    const callSeconds = this.quantity(rows, 'TWILIO', 'CALL_SECONDS');
    const meetingSeconds = this.quantity(
      rows,
      'RECALL',
      'MEETING_CAPTURE_SECONDS',
    );
    const aiLimit = this.limitWithAddons(
      subscription.snapshotLimits?.aiActionsPerMonth,
      subscription.activeAddons,
      AddonCategory.AI_ACTIONS,
    );
    const callMinuteLimit = this.limitWithAddons(
      subscription.snapshotLimits?.callMinutesPerMonth,
      subscription.activeAddons,
      AddonCategory.VOICE_MINUTES,
    );
    const meetingHourLimit = this.limitWithAddons(
      subscription.snapshotLimits?.meetingHoursPerMonth,
      subscription.activeAddons,
      AddonCategory.AI_MEETING_CAPTURE,
    );

    return {
      period: { start: periodStart, end: periodEnd },
      subscription: {
        planType: plan.planType,
        status: subscription.status,
        billingInterval: subscription.billingInterval ?? null,
      },
      metrics: {
        aiActions: this.metric(aiActions, aiLimit, 'ACTION'),
        callMinutes: this.metric(
          Number((callSeconds / 60).toFixed(2)),
          callMinuteLimit,
          'MINUTE',
        ),
        meetingHours: {
          ...this.metric(
            Number((meetingSeconds / 3600).toFixed(2)),
            meetingHourLimit,
            'HOUR',
          ),
          availability: meetingSeconds > 0 ? 'AVAILABLE' : 'UNAVAILABLE',
          ...(meetingSeconds > 0
            ? {}
            : { reason: 'AUTHORITATIVE_RECALL_DURATION_NOT_RECORDED' }),
        },
      },
      providerUsage: rows,
    };
  }

  private metric(used: number, included: number, unit: string) {
    return {
      used,
      included,
      remaining: Math.max(0, Number((included - used).toFixed(2))),
      overage: Math.max(0, Number((used - included).toFixed(2))),
      unit,
    };
  }

  private quantity(
    rows: Array<{ provider: string; metric: string; quantity: number }>,
    provider: string,
    metric: string,
  ) {
    return (
      rows.find((row) => row.provider === provider && row.metric === metric)
        ?.quantity ?? 0
    );
  }

  private limitWithAddons(
    base: number | undefined,
    addons: Array<{ category: AddonCategory; quantity: number }> | undefined,
    category: AddonCategory,
  ) {
    return (
      (base ?? 0) +
      (addons ?? [])
        .filter((addon) => addon.category === category)
        .reduce((total, addon) => total + addon.quantity, 0)
    );
  }

  private period(subscription: {
    currentPeriodStart?: Date;
    currentPeriodEnd?: Date;
    billingInterval?: string;
  }) {
    return resolveUsagePeriod(subscription);
  }
}
