import { Injectable } from '@nestjs/common';
import { CrmDealStageCategory } from '../../database/schemas/crm-deal.schema';

type CrmLink = Record<string, unknown>;
type Deal = Record<string, unknown>;
type OperationalRecord = Record<string, unknown>;

type GroundingFactor = {
  key: string;
  contribution: number;
  detail: string;
};

@Injectable()
export class ContactCommercialSummaryService {
  build(input: {
    profile: Record<string, unknown>;
    crmLinks: CrmLink[];
    deals: Deal[];
    latestHealth: Record<string, unknown> | null;
    openTasks?: OperationalRecord[];
    upcomingMeetings?: OperationalRecord[];
    recentCalls?: OperationalRecord[];
    asOf?: Date;
  }) {
    const openDeals = input.deals.filter(
      (deal) => deal.stageCategory === CrmDealStageCategory.OPEN,
    );
    const amounts = this.amounts(openDeals);
    const expectedClose = this.expectedClose(openDeals);
    const probability = this.probability(openDeals, input.crmLinks);
    const expansionPotential = this.expansionPotential({
      profile: input.profile,
      openDeals,
      latestHealth: input.latestHealth,
      recentCalls: input.recentCalls || [],
      upcomingMeetings: input.upcomingMeetings || [],
    });
    const nextBestAction = this.nextBestAction({
      openTasks: input.openTasks || [],
      upcomingMeetings: input.upcomingMeetings || [],
      recentCalls: input.recentCalls || [],
      openDeals,
      latestHealth: input.latestHealth,
      expectedClose,
      asOf: input.asOf || new Date(),
    });

    return {
      commercial: {
        dealValue: amounts.length
          ? {
              availability: 'AVAILABLE',
              aggregateAvailable: amounts.length === 1,
              value: amounts.length === 1 ? amounts[0].value : null,
              currency: amounts.length === 1 ? amounts[0].currency : null,
              breakdown: amounts,
              dealCount: openDeals.length,
            }
          : this.unavailable('No linked open CRM deal is available.'),
        closeProbability: probability,
        expectedClose: expectedClose
          ? {
              availability: 'AVAILABLE',
              value: expectedClose.value,
              dealId: expectedClose.dealId,
              source: 'CRM_DEAL',
            }
          : this.unavailable(
              'No close date is available on a linked open CRM deal.',
            ),
        expansionPotential,
        lifetimeValue: this.unavailable(
          'Customer lifetime value is not persisted or attributable yet.',
        ),
      },
      insights: {
        qualification: input.profile.leadStatus
          ? {
              availability: 'AVAILABLE',
              value: input.profile.leadStatus,
              source: 'CONTACT_PROFILE',
              isAiGenerated: false,
            }
          : this.unavailable('Customer lead status is not available.'),
        risk: input.latestHealth
          ? {
              availability: 'AVAILABLE',
              level: input.latestHealth.riskLevel,
              healthScore: input.latestHealth.healthScore,
              confidence: input.latestHealth.analysisConfidence ?? null,
              capturedAt: input.latestHealth.capturedAt,
              source: 'CUSTOMER_HEALTH_SNAPSHOT',
              isAiGenerated: true,
            }
          : this.unavailable('No persisted customer-health insight exists.'),
        predictedClose: expectedClose
          ? {
              availability: 'AVAILABLE',
              value: expectedClose.value,
              source: 'CRM_DEAL_CLOSE_DATE',
              isAiGenerated: false,
            }
          : this.unavailable('No linked CRM close date is available.'),
        nextBestAction,
      },
    };
  }

  private expansionPotential(input: {
    profile: Record<string, unknown>;
    openDeals: Deal[];
    latestHealth: Record<string, unknown> | null;
    recentCalls: OperationalRecord[];
    upcomingMeetings: OperationalRecord[];
  }) {
    const factors: GroundingFactor[] = [];
    const leadContribution = this.leadStatusContribution(
      String(input.profile.leadStatus || ''),
    );
    if (leadContribution > 0) {
      factors.push({
        key: 'LEAD_STATUS',
        contribution: leadContribution,
        detail: `Lead status is ${String(input.profile.leadStatus)}.`,
      });
    }
    if (input.openDeals.length) {
      factors.push({
        key: 'OPEN_DEALS',
        contribution: Math.min(30, 20 + (input.openDeals.length - 1) * 5),
        detail: `${input.openDeals.length} linked open CRM deal(s).`,
      });
    }
    const healthScore = Number(input.latestHealth?.healthScore);
    if (Number.isFinite(healthScore)) {
      const contribution = Math.round(
        Math.max(0, Math.min(100, healthScore)) * 0.25,
      );
      factors.push({
        key: 'CUSTOMER_HEALTH',
        contribution,
        detail: `Latest customer health score is ${healthScore}.`,
      });
    }
    const engagementCount =
      input.recentCalls.length + input.upcomingMeetings.length;
    if (engagementCount) {
      factors.push({
        key: 'ENGAGEMENT',
        contribution: Math.min(15, engagementCount * 5),
        detail: `${engagementCount} linked recent/upcoming engagement(s).`,
      });
    }
    if (!factors.length) {
      return this.unavailable(
        'No grounded CRM, lead-status, health, or engagement signals are available.',
      );
    }
    const score = Math.min(
      100,
      factors.reduce((total, factor) => total + factor.contribution, 0),
    );
    return {
      availability: 'AVAILABLE',
      score,
      level: score >= 70 ? 'HIGH' : score >= 40 ? 'MEDIUM' : 'LOW',
      unit: 'SCORE',
      isEstimated: true,
      isAiGenerated: false,
      source: 'RULE_BASED_CUSTOMER_SIGNALS',
      methodologyVersion: '1.0',
      factors,
    };
  }

  private nextBestAction(input: {
    openTasks: OperationalRecord[];
    upcomingMeetings: OperationalRecord[];
    recentCalls: OperationalRecord[];
    openDeals: Deal[];
    latestHealth: Record<string, unknown> | null;
    expectedClose: { dealId: string; value: string } | undefined;
    asOf: Date;
  }) {
    const overdueTask = input.openTasks.find((task) => {
      const dueDate = this.date(task.dueDate);
      return dueDate
        ? new Date(dueDate).getTime() < input.asOf.getTime()
        : false;
    });
    if (overdueTask) {
      return this.recommendation(
        'COMPLETE_OVERDUE_TASK',
        `Complete overdue task: ${String(overdueTask.title || 'Untitled task')}`,
        'An explicitly linked customer task is overdue.',
        'TASK',
        String(overdueTask._id || overdueTask.id),
      );
    }
    const meeting = input.upcomingMeetings[0];
    if (meeting) {
      return this.recommendation(
        'PREPARE_FOR_MEETING',
        `Prepare for meeting: ${String(meeting.title || 'Customer meeting')}`,
        'An explicitly linked customer meeting is upcoming.',
        'MEETING',
        String(meeting._id || meeting.id),
      );
    }
    if (String(input.latestHealth?.riskLevel || '').toUpperCase() === 'HIGH') {
      return this.recommendation(
        'REVIEW_CUSTOMER_RISK',
        'Review customer risk and agree a follow-up plan',
        'The latest persisted customer-health snapshot has HIGH risk.',
        'CUSTOMER_HEALTH_SNAPSHOT',
      );
    }
    if (input.expectedClose) {
      return this.recommendation(
        'FOLLOW_UP_OPEN_DEAL',
        'Follow up on the next closing CRM deal',
        `A linked open deal has an expected close date of ${input.expectedClose.value}.`,
        'CRM_DEAL',
        input.expectedClose.dealId,
      );
    }
    const task = input.openTasks[0];
    if (task) {
      return this.recommendation(
        'PROGRESS_OPEN_TASK',
        `Progress task: ${String(task.title || 'Untitled task')}`,
        'An explicitly linked customer task remains open.',
        'TASK',
        String(task._id || task.id),
      );
    }
    if (input.openDeals.length) {
      const deal = input.openDeals[0];
      return this.recommendation(
        'FOLLOW_UP_OPEN_DEAL',
        'Follow up on the open CRM opportunity',
        'The customer has a linked open CRM deal.',
        'CRM_DEAL',
        String(deal._id || deal.id),
      );
    }
    if (!input.recentCalls.length) {
      return this.recommendation(
        'CONTACT_CUSTOMER',
        'Contact the customer and capture the next step',
        'No explicitly linked recent call is available.',
        'CONTACT_PROFILE',
      );
    }
    return this.recommendation(
      'REVIEW_CUSTOMER',
      'Review the latest customer interaction',
      'Recent customer activity exists without a more urgent grounded action.',
      'CALL',
      String(input.recentCalls[0]._id || input.recentCalls[0].id),
    );
  }

  private recommendation(
    action: string,
    value: string,
    reason: string,
    sourceType: string,
    sourceId?: string,
  ) {
    return {
      availability: 'AVAILABLE',
      action,
      value,
      reason,
      source: { type: sourceType, id: sourceId || null },
      isEstimated: true,
      isAiGenerated: false,
      methodologyVersion: '1.0',
    };
  }

  private leadStatusContribution(status: string) {
    const contributions: Record<string, number> = {
      NEW: 5,
      CONTACTED: 10,
      QUALIFIED: 20,
      PROPOSAL: 25,
      HOT_LEAD: 30,
      NEGOTIATION: 30,
      CLOSED_WON: 15,
      CLOSED_LOST: 0,
    };
    return contributions[status.toUpperCase()] || 0;
  }

  private amounts(deals: Deal[]) {
    const totals = new Map<string, { value: number; dealCount: number }>();
    for (const deal of deals) {
      const amount = Number(deal.amount);
      if (!Number.isFinite(amount)) continue;
      const currency = String(deal.currency || 'USD').toUpperCase();
      const current = totals.get(currency) || { value: 0, dealCount: 0 };
      current.value += amount;
      current.dealCount += 1;
      totals.set(currency, current);
    }
    return [...totals.entries()]
      .map(([currency, value]) => ({ currency, ...value }))
      .sort((left, right) => left.currency.localeCompare(right.currency));
  }

  private expectedClose(deals: Deal[]) {
    return deals
      .map((deal) => ({
        dealId: String(deal._id || deal.id),
        value: this.date(deal.closeDate),
      }))
      .filter(
        (item): item is { dealId: string; value: string } =>
          item.value !== null,
      )
      .sort((left, right) => left.value.localeCompare(right.value))[0];
  }

  private probability(deals: Deal[], links: CrmLink[]) {
    const linkByIdentity = new Map(
      links.map((link) => [
        `${String(link.provider)}:${String(link.externalId)}`,
        link,
      ]),
    );
    const values = deals
      .map((deal) => {
        const link = linkByIdentity.get(
          `${String(deal.provider)}:${String(deal.externalId)}`,
        );
        const record = this.record(link?.record);
        const properties = this.record(record?.properties);
        const raw = this.first(properties, [
          'hs_deal_stage_probability',
          'probability',
          'Probability',
        ]);
        const probability = this.percent(raw);
        const amount = Number(deal.amount);
        return probability === null
          ? null
          : {
              probability,
              weight: Number.isFinite(amount) && amount > 0 ? amount : 1,
            };
      })
      .filter(
        (value): value is { probability: number; weight: number } =>
          value !== null,
      );
    if (!values.length) {
      return this.unavailable(
        'No explicit probability is available on linked open CRM deals.',
      );
    }
    const weight = values.reduce((sum, item) => sum + item.weight, 0);
    const weighted = values.reduce(
      (sum, item) => sum + item.probability * item.weight,
      0,
    );
    return {
      availability: values.length === deals.length ? 'AVAILABLE' : 'PARTIAL',
      value: Number((weighted / weight).toFixed(2)),
      unit: 'PERCENT',
      coverage: { withProbability: values.length, totalDeals: deals.length },
      source: 'CRM_RECORD_PROPERTIES',
    };
  }

  private percent(value: unknown) {
    if (value === null || value === undefined || value === '') return null;
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0) return null;
    const percent = parsed <= 1 ? parsed * 100 : parsed;
    return percent <= 100 ? percent : null;
  }

  private date(value: unknown) {
    if (!value) return null;
    const date = new Date(String(value));
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }

  private first(
    record: Record<string, unknown> | null,
    keys: string[],
  ): unknown {
    if (!record) return undefined;
    for (const key of keys) {
      if (record[key] !== undefined && record[key] !== null) return record[key];
    }
    return undefined;
  }

  private record(value: unknown) {
    return value && typeof value === 'object'
      ? (value as Record<string, unknown>)
      : null;
  }

  private unavailable(reason: string) {
    return { availability: 'UNAVAILABLE', reason };
  }
}
