import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { SubscriptionPlansService } from './subscription-plans.service';
import { SubscriptionAnalyticsRepository } from './subscription-analytics.repository';
import { RevenueOverviewRange } from './dto/revenue-overview-query.dto';

const MONTH_LABELS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

function startOfUtcDay(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}

function endOfUtcMonth(year: number, monthIndex: number): Date {
  // Day 0 of next month = last day of this month, at 23:59:59.999 UTC.
  return new Date(Date.UTC(year, monthIndex + 1, 0, 23, 59, 59, 999));
}

// Percent change vs a baseline. Returns null (not 0) when there's no
// baseline yet — that's an honest "not enough history", not "no change".
function pctChange(current: number, previous?: number | null): number | null {
  if (previous === undefined || previous === null) return null;
  if (previous === 0) return current === 0 ? 0 : null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

@Injectable()
export class SubscriptionAnalyticsService implements OnModuleInit {
  private readonly logger = new Logger(SubscriptionAnalyticsService.name);

  constructor(
    private readonly repository: SubscriptionAnalyticsRepository,
    private readonly plansService: SubscriptionPlansService,
  ) {}

  // Ensures a snapshot exists from the moment this feature ships, rather
  // than leaving the trend chart empty until the first midnight cron run.
  async onModuleInit() {
    try {
      await this.writeDailySnapshot();
    } catch (error) {
      this.logger.warn(`Initial revenue snapshot failed: ${error}`);
    }
  }

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async writeDailySnapshot() {
    const today = startOfUtcDay(new Date());
    const [totals, byPlan] = await Promise.all([
      this.repository.getLiveTotals(),
      this.repository.getLiveTotalsByPlan(),
    ]);
    const planCounts = await this.resolvePlanCounts(byPlan);

    await this.repository.upsertSnapshotForDate(today, {
      mrrUsd: totals.mrrUsd,
      arrUsd: totals.mrrUsd * 12,
      activeSubscriptions: totals.activeSubscriptions,
      planCounts,
    });
  }

  // 1. The four overview cards.
  async getOverviewCards() {
    const now = new Date();
    const totals = await this.repository.getLiveTotals();
    const arrUsd = totals.mrrUsd * 12;

    const startOfThisMonth = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
    );
    const startOfToday = startOfUtcDay(now);
    const oneMonthAgo = new Date(now);
    oneMonthAgo.setUTCMonth(oneMonthAgo.getUTCMonth() - 1);
    const oneYearAgo = new Date(now);
    oneYearAgo.setUTCFullYear(oneYearAgo.getUTCFullYear() - 1);

    const [
      renewalsThisMonth,
      renewalsToday,
      lastMonthSnapshot,
      lastYearSnapshot,
    ] = await Promise.all([
      this.repository.countRenewalsSince(startOfThisMonth),
      this.repository.countRenewalsSince(startOfToday),
      this.repository.findNearestSnapshotBefore(oneMonthAgo),
      this.repository.findNearestSnapshotBefore(oneYearAgo),
    ]);

    return {
      activeSubscriptions: {
        value: totals.activeSubscriptions,
        changePercentVsLastMonth: pctChange(
          totals.activeSubscriptions,
          lastMonthSnapshot?.activeSubscriptions,
        ),
      },
      monthlyRevenueUsd: {
        value: totals.mrrUsd,
        changePercentVsLastMonth: pctChange(
          totals.mrrUsd,
          lastMonthSnapshot?.mrrUsd,
        ),
      },
      annualRevenueUsd: {
        value: arrUsd,
        changePercentVsLastYear: pctChange(arrUsd, lastYearSnapshot?.arrUsd),
      },
      renewalsThisMonth: {
        value: renewalsThisMonth,
        today: renewalsToday,
      },
    };
  }

  // 2. Revenue overview — monthly series for the current year to date.
  // Renewal note: only "yearly" exists today, kept as an enum/DTO so a
  // future range (e.g. "monthly" showing daily points) is additive, not
  // a breaking change to this response shape.
  async getRevenueOverview(range: RevenueOverviewRange) {
    void range; // reserved for when a second range value is added
    const now = new Date();
    const year = now.getUTCFullYear();
    const currentMonthIndex = now.getUTCMonth();

    const yearStart = new Date(Date.UTC(year, 0, 1));
    const snapshots = await this.repository.findSnapshotsBetween(
      yearStart,
      now,
    );

    const series = [];
    for (let month = 0; month <= currentMonthIndex; month += 1) {
      const cutoff = endOfUtcMonth(year, month);
      // Latest snapshot at or before the end of this month = that
      // month's closing MRR. null (not 0) means no snapshot existed yet
      // — e.g. months before this feature was deployed.
      const snapshotForMonth = [...snapshots]
        .reverse()
        .find((snapshot) => snapshot.date <= cutoff);
      series.push({
        month: MONTH_LABELS[month],
        mrrUsd: snapshotForMonth?.mrrUsd ?? null,
      });
    }

    const totals = await this.repository.getLiveTotals();
    const currentMrrUsd = totals.mrrUsd;
    const firstDataPoint = series.find((point) => point.mrrUsd !== null);
    const growthPercent = firstDataPoint
      ? pctChange(currentMrrUsd, firstDataPoint.mrrUsd)
      : null;

    return {
      series,
      totals: {
        mrrUsd: currentMrrUsd,
        arrUsd: currentMrrUsd * 12,
        growthPercent,
      },
    };
  }

  // 3. Plan distribution donut.
  async getPlanDistribution() {
    const [plans, byPlan] = await Promise.all([
      this.plansService.findAll(false), // active, purchasable plans only
      this.repository.getLiveTotalsByPlan(),
    ]);

    const countsByPlanId = new Map(
      byPlan.map((row) => [
        row._id,
        { count: row.count, mrrUsd: row.mrrUsd },
      ]),
    );
    const totalSubscriptions = byPlan.reduce(
      (sum, row) => sum + row.count,
      0,
    );

    const distribution = plans
      .filter((plan) => !plan.isInquiryOnly)
      .map((plan) => {
        const stats = countsByPlanId.get(String(plan._id));
        const count = stats?.count ?? 0;
        return {
          planId: String(plan._id),
          planType: plan.planType,
          name: plan.name,
          count,
          percent: totalSubscriptions
            ? Math.round((count / totalSubscriptions) * 1000) / 10
            : 0,
        };
      });

    const now = new Date();
    const oneMonthAgo = new Date(now);
    oneMonthAgo.setUTCMonth(oneMonthAgo.getUTCMonth() - 1);
    const [totals, lastMonthSnapshot] = await Promise.all([
      this.repository.getLiveTotals(),
      this.repository.findNearestSnapshotBefore(oneMonthAgo),
    ]);

    return {
      totalSubscriptions,
      distribution,
      totalMrrUsd: totals.mrrUsd,
      mrrChangePercentVsLastMonth: pctChange(
        totals.mrrUsd,
        lastMonthSnapshot?.mrrUsd,
      ),
    };
  }

  private async resolvePlanCounts(
    byPlan: { _id: string; count: number; mrrUsd: number }[],
  ): Promise<Record<string, number>> {
    if (byPlan.length === 0) return {};
    const plans = await this.plansService.findAll(true);
    const planTypeByPlanId = new Map(
      plans.map((plan) => [String(plan._id), plan.planType]),
    );

    const planCounts: Record<string, number> = {};
    for (const row of byPlan) {
      const planType = planTypeByPlanId.get(row._id);
      if (!planType) continue;
      planCounts[planType] = (planCounts[planType] ?? 0) + row.count;
    }
    return planCounts;
  }
}