import { BadRequestException, Injectable } from '@nestjs/common';
import {
  localCalendarDate,
  localMidnightUtc,
} from '../../common/helpers/local-date-range.helper';
import {
  REVENUE_ANALYTICS_CURRENCY,
  REVENUE_ANALYTICS_MAX_RANGE_DAYS,
  REVENUE_ANALYTICS_METHODOLOGY_VERSION,
  REVENUE_ANALYTICS_SCHEMA_VERSION,
} from './revenue-analytics.constants';
import {
  RevenueAnalyticsAvailability,
  RevenueAnalyticsMeasurementBasis,
  RevenueAnalyticsMetricKey,
  RevenueAnalyticsMovementType,
} from './revenue-analytics.enums';
import { RevenueLifecycleRepository } from './revenue-lifecycle.repository';
import {
  RevenueCohortOrganizationRecord,
  RevenueLifetimeInvoiceRecord,
  RevenueMovementReadRecord,
  RevenueSnapshotReadRecord,
} from './revenue-lifecycle.types';
import {
  RevenueCohortResponse,
  RevenueMetricValueResponse,
  RevenuePlanLtvResponse,
  RevenueRetentionResponse,
  RevenueRetentionTrendPointResponse,
} from './revenue-retention.types';
import { RevenueAnalyticsRangeQueryDto } from './dto/revenue-analytics-range-query.dto';

const DAY_MS = 24 * 60 * 60_000;
const COHORT_MONTHS = 7;

type Period = { start: Date; end: Date; label: string };

function money(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function percentage(numerator: number, denominator: number) {
  if (denominator <= 0) return null;
  return money((numerator / denominator) * 100);
}

@Injectable()
export class RevenueRetentionService {
  constructor(private readonly repository: RevenueLifecycleRepository) {}

  async getRetention(
    query: RevenueAnalyticsRangeQueryDto,
  ): Promise<RevenueRetentionResponse> {
    this.assertRange(query.from, query.to);
    const periods = this.monthlyPeriods(query.from, query.to, query.timezone);
    const [
      openingSnapshots,
      expectedOpeningOrganizations,
      movements,
      lifetimeInvoices,
      cohortOrganizations,
      trackingStartedAt,
    ] = await Promise.all([
      this.repository.findOpeningSnapshots(query.from, query.planId),
      this.repository.countOrganizationsStartedBefore(query.from, query.planId),
      this.repository.findMovements(query.from, query.to, query.planId),
      this.repository.findLifetimePaidRevenue(query.to, query.planId),
      this.repository.findCohortOrganizations(
        query.from,
        query.to,
        query.planId,
      ),
      this.repository.findTrackingStartedAt(),
    ]);

    const availability = this.coverageAvailability(
      expectedOpeningOrganizations,
      openingSnapshots.length,
    );
    const trend = this.buildTrend(
      periods,
      openingSnapshots,
      movements,
      availability,
    );
    const summary = this.buildSummary(
      openingSnapshots,
      movements,
      lifetimeInvoices,
      availability,
    );
    const lifetimeValueByPlan = await this.buildPlanLtv(lifetimeInvoices);
    const cohorts = await this.buildCohorts(
      cohortOrganizations,
      query.to,
      query.timezone,
    );

    return {
      schemaVersion: REVENUE_ANALYTICS_SCHEMA_VERSION,
      methodologyVersion: REVENUE_ANALYTICS_METHODOLOGY_VERSION,
      currency: REVENUE_ANALYTICS_CURRENCY,
      from: query.from.toISOString(),
      to: query.to.toISOString(),
      timezone: query.timezone,
      generatedAt: new Date().toISOString(),
      summary,
      trend,
      lifetimeValueByPlan,
      cohorts,
      coverage: {
        expectedOpeningOrganizations,
        snapshottedOpeningOrganizations: openingSnapshots.length,
        movements: movements.length,
        paidInvoiceOrganizations: new Set(
          lifetimeInvoices.map((item) => item.organizationId),
        ).size,
        trackingStartedAt: trackingStartedAt?.toISOString() ?? null,
      },
    };
  }

  private buildSummary(
    openingSnapshots: RevenueSnapshotReadRecord[],
    movements: RevenueMovementReadRecord[],
    invoices: RevenueLifetimeInvoiceRecord[],
    availability: RevenueAnalyticsAvailability,
  ) {
    const openingOrganizations = new Set(
      openingSnapshots
        .filter((item) => item.revenueActive)
        .map((item) => item.organizationId),
    );
    const openingMrr = money(
      openingSnapshots
        .filter((item) => item.revenueActive)
        .reduce((sum, item) => sum + item.normalizedMrrUsd, 0),
    );
    const eligible = movements.filter((item) =>
      openingOrganizations.has(item.organizationId),
    );
    const churnedOrganizations = new Set(
      eligible
        .filter((item) => item.type === RevenueAnalyticsMovementType.CHURN)
        .map((item) => item.organizationId),
    ).size;
    const expansion = this.movementAmount(
      eligible,
      RevenueAnalyticsMovementType.EXPANSION,
    );
    const contraction = Math.abs(
      this.movementAmount(eligible, RevenueAnalyticsMovementType.CONTRACTION),
    );
    const churnedMrr = Math.abs(
      this.movementAmount(eligible, RevenueAnalyticsMovementType.CHURN),
    );
    const revenueByOrganization = new Map<string, number>();
    for (const invoice of invoices) {
      revenueByOrganization.set(
        invoice.organizationId,
        (revenueByOrganization.get(invoice.organizationId) ?? 0) +
          invoice.paidRevenueUsd,
      );
    }
    const paidRevenue = money(
      [...revenueByOrganization.values()].reduce(
        (sum, value) => sum + value,
        0,
      ),
    );
    const realizedLtv =
      revenueByOrganization.size > 0
        ? money(paidRevenue / revenueByOrganization.size)
        : null;

    return [
      this.metric(
        RevenueAnalyticsMetricKey.LOGO_CHURN_RATE,
        'Logo churn rate',
        percentage(churnedOrganizations, openingOrganizations.size),
        'PERCENT',
        availability,
        RevenueAnalyticsMeasurementBasis.DERIVED,
        churnedOrganizations,
        openingOrganizations.size,
      ),
      this.metric(
        RevenueAnalyticsMetricKey.REVENUE_CHURN_RATE,
        'Revenue churn rate',
        percentage(churnedMrr, openingMrr),
        'PERCENT',
        availability,
        RevenueAnalyticsMeasurementBasis.DERIVED,
        churnedMrr,
        openingMrr,
      ),
      this.metric(
        RevenueAnalyticsMetricKey.NET_REVENUE_RETENTION,
        'Net revenue retention',
        percentage(
          openingMrr + expansion - contraction - churnedMrr,
          openingMrr,
        ),
        'PERCENT',
        availability,
        RevenueAnalyticsMeasurementBasis.DERIVED,
        money(openingMrr + expansion - contraction - churnedMrr),
        openingMrr,
      ),
      this.metric(
        RevenueAnalyticsMetricKey.REALIZED_LTV,
        'Realized customer lifetime value',
        realizedLtv,
        'CURRENCY_USD',
        revenueByOrganization.size > 0
          ? RevenueAnalyticsAvailability.PARTIAL
          : RevenueAnalyticsAvailability.UNAVAILABLE,
        RevenueAnalyticsMeasurementBasis.MEASURED,
        paidRevenue,
        revenueByOrganization.size,
        false,
        'Calculated from locally retained paid invoices; historical provider coverage is not assumed complete.',
      ),
      this.metric(
        RevenueAnalyticsMetricKey.LTV_CAC_RATIO,
        'LTV to CAC ratio',
        null,
        'RATIO',
        RevenueAnalyticsAvailability.UNAVAILABLE,
        RevenueAnalyticsMeasurementBasis.DERIVED,
        null,
        null,
        false,
        'Acquisition cost data is not available in Phase 3.',
      ),
    ];
  }

  private buildTrend(
    periods: Period[],
    openingSnapshots: RevenueSnapshotReadRecord[],
    movements: RevenueMovementReadRecord[],
    availability: RevenueAnalyticsAvailability,
  ) {
    const active = new Map(
      openingSnapshots
        .filter((item) => item.revenueActive)
        .map((item) => [item.organizationId, item.normalizedMrrUsd]),
    );

    return periods.map<RevenueRetentionTrendPointResponse>((period) => {
      const openingIds = new Set(active.keys());
      const openingMrr = money(
        [...active.values()].reduce((sum, value) => sum + value, 0),
      );
      const periodMovements = movements.filter(
        (item) =>
          item.effectiveAt >= period.start && item.effectiveAt < period.end,
      );
      const eligible = periodMovements.filter((item) =>
        openingIds.has(item.organizationId),
      );
      const churnedOrganizations = new Set(
        eligible
          .filter((item) => item.type === RevenueAnalyticsMovementType.CHURN)
          .map((item) => item.organizationId),
      ).size;
      const expansionMrrUsd = this.movementAmount(
        eligible,
        RevenueAnalyticsMovementType.EXPANSION,
      );
      const contractionMrrUsd = Math.abs(
        this.movementAmount(eligible, RevenueAnalyticsMovementType.CONTRACTION),
      );
      const churnedMrrUsd = Math.abs(
        this.movementAmount(eligible, RevenueAnalyticsMovementType.CHURN),
      );
      for (const movement of periodMovements) {
        if (movement.nextMrrUsd > 0) {
          active.set(movement.organizationId, movement.nextMrrUsd);
        } else {
          active.delete(movement.organizationId);
        }
      }

      const pointAvailability =
        openingIds.size > 0
          ? availability
          : RevenueAnalyticsAvailability.UNAVAILABLE;
      return {
        periodStart: period.start.toISOString(),
        periodEnd: period.end.toISOString(),
        label: period.label,
        openingOrganizations: openingIds.size,
        churnedOrganizations,
        openingMrrUsd: openingMrr,
        expansionMrrUsd,
        contractionMrrUsd,
        churnedMrrUsd,
        logoChurnRate: percentage(churnedOrganizations, openingIds.size),
        revenueChurnRate: percentage(churnedMrrUsd, openingMrr),
        netRevenueRetention: percentage(
          openingMrr + expansionMrrUsd - contractionMrrUsd - churnedMrrUsd,
          openingMrr,
        ),
        availability: pointAvailability,
      };
    });
  }

  private async buildPlanLtv(invoices: RevenueLifetimeInvoiceRecord[]) {
    const grouped = new Map<string, RevenueLifetimeInvoiceRecord[]>();
    for (const invoice of invoices) {
      const planId = invoice.planId ?? 'UNASSIGNED';
      grouped.set(planId, [...(grouped.get(planId) ?? []), invoice]);
    }
    const planIds = [...grouped.keys()].filter((id) => id !== 'UNASSIGNED');
    const labels = await this.repository.findPlanLabels(planIds);
    return [...grouped.entries()]
      .map<RevenuePlanLtvResponse>(([planId, records]) => {
        const realizedRevenueUsd = money(
          records.reduce((sum, item) => sum + item.paidRevenueUsd, 0),
        );
        return {
          planId,
          planName:
            planId === 'UNASSIGNED'
              ? 'Unassigned plan'
              : (labels.get(planId)?.name ?? 'Unknown plan'),
          organizationsWithPaidInvoices: records.length,
          paidInvoices: records.reduce(
            (sum, item) => sum + item.invoiceCount,
            0,
          ),
          realizedRevenueUsd,
          averageRealizedLtvUsd:
            records.length > 0
              ? money(realizedRevenueUsd / records.length)
              : null,
          availability: RevenueAnalyticsAvailability.PARTIAL,
          isEstimated: false,
        };
      })
      .sort((a, b) => b.realizedRevenueUsd - a.realizedRevenueUsd);
  }

  private async buildCohorts(
    organizations: RevenueCohortOrganizationRecord[],
    reportEnd: Date,
    timezone: string,
  ) {
    const grouped = new Map<string, RevenueCohortOrganizationRecord[]>();
    for (const organization of organizations) {
      const key = this.monthKey(organization.subscriptionStartedAt, timezone);
      grouped.set(key, [...(grouped.get(key) ?? []), organization]);
    }
    const checkpoints = new Map<string, Date[]>();
    const allDates = new Map<string, Date>();
    for (const key of grouped.keys()) {
      const [year, month] = key.split('-').map(Number);
      const dates = Array.from({ length: COHORT_MONTHS }, (_, index) => {
        const boundary = localMidnightUtc(
          this.addLocalMonths({ year, month, day: 1 }, index + 1),
          timezone,
        );
        const snapshotDate = this.utcDay(new Date(boundary.getTime() - 1));
        allDates.set(snapshotDate.toISOString(), snapshotDate);
        return snapshotDate;
      });
      checkpoints.set(key, dates);
    }
    const organizationIds = organizations.map((item) => item.organizationId);
    const snapshots = await this.repository.findSnapshotsAtDates(
      organizationIds,
      [...allDates.values()],
    );
    const snapshotIndex = new Map(
      snapshots.map((item) => [
        `${item.organizationId}:${item.snapshotDate.toISOString()}`,
        item,
      ]),
    );

    return [...grouped.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map<RevenueCohortResponse>(([cohort, records]) => ({
        cohort,
        originalOrganizations: records.length,
        months: (checkpoints.get(cohort) ?? []).map((snapshotDate, month) => {
          if (snapshotDate >= reportEnd) {
            return {
              month,
              retainedOrganizations: null,
              retentionRate: null,
              availability: RevenueAnalyticsAvailability.UNAVAILABLE,
            };
          }
          const cohortSnapshots = records
            .map((record) =>
              snapshotIndex.get(
                `${record.organizationId}:${snapshotDate.toISOString()}`,
              ),
            )
            .filter((item): item is RevenueSnapshotReadRecord => Boolean(item));
          const retained = cohortSnapshots.filter(
            (item) => item.revenueActive,
          ).length;
          const cellAvailability = this.coverageAvailability(
            records.length,
            cohortSnapshots.length,
          );
          return {
            month,
            retainedOrganizations:
              cellAvailability === RevenueAnalyticsAvailability.UNAVAILABLE
                ? null
                : retained,
            retentionRate:
              cellAvailability === RevenueAnalyticsAvailability.UNAVAILABLE
                ? null
                : percentage(retained, records.length),
            availability: cellAvailability,
          };
        }),
      }));
  }

  private metric(
    key: RevenueAnalyticsMetricKey,
    label: string,
    value: number | null,
    unit: RevenueMetricValueResponse['unit'],
    availability: RevenueAnalyticsAvailability,
    basis: RevenueAnalyticsMeasurementBasis,
    numerator?: number | null,
    denominator?: number | null,
    isEstimated = false,
    note?: string,
  ): RevenueMetricValueResponse {
    const effectiveAvailability =
      value === null ? RevenueAnalyticsAvailability.UNAVAILABLE : availability;
    return {
      key,
      label,
      value,
      unit,
      availability: effectiveAvailability,
      basis,
      isEstimated,
      numerator,
      denominator,
      note,
    };
  }

  private movementAmount(
    movements: RevenueMovementReadRecord[],
    type: RevenueAnalyticsMovementType,
  ) {
    return money(
      movements
        .filter((item) => item.type === type)
        .reduce((sum, item) => sum + item.deltaMrrUsd, 0),
    );
  }

  private coverageAvailability(expected: number, found: number) {
    if (expected > 0 && found >= expected) {
      return RevenueAnalyticsAvailability.AVAILABLE;
    }
    if (found > 0) return RevenueAnalyticsAvailability.PARTIAL;
    return RevenueAnalyticsAvailability.UNAVAILABLE;
  }

  private monthlyPeriods(from: Date, to: Date, timezone: string) {
    const periods: Period[] = [];
    let cursor = new Date(from);
    while (cursor < to) {
      const local = localCalendarDate(cursor, timezone);
      const nextMonth = localMidnightUtc(
        this.addLocalMonths({ ...local, day: 1 }, 1),
        timezone,
      );
      const end = nextMonth < to ? nextMonth : new Date(to);
      periods.push({
        start: new Date(cursor),
        end,
        label: new Intl.DateTimeFormat('en-US', {
          timeZone: timezone,
          month: 'short',
          year: 'numeric',
        }).format(cursor),
      });
      cursor = end;
    }
    return periods;
  }

  private monthKey(value: Date, timezone: string) {
    const local = localCalendarDate(value, timezone);
    return `${local.year}-${String(local.month).padStart(2, '0')}`;
  }

  private addLocalMonths(
    value: { year: number; month: number; day: number },
    months: number,
  ) {
    const date = new Date(Date.UTC(value.year, value.month - 1 + months, 1));
    return {
      year: date.getUTCFullYear(),
      month: date.getUTCMonth() + 1,
      day: 1,
    };
  }

  private utcDay(value: Date) {
    return new Date(
      Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()),
    );
  }

  private assertRange(from: Date, to: Date) {
    if (from >= to) throw new BadRequestException('from must be before to');
    if (
      to.getTime() - from.getTime() >
      REVENUE_ANALYTICS_MAX_RANGE_DAYS * DAY_MS
    ) {
      throw new BadRequestException(
        `Revenue analytics range cannot exceed ${REVENUE_ANALYTICS_MAX_RANGE_DAYS} days`,
      );
    }
  }
}
