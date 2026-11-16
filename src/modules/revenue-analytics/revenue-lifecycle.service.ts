import { createHash } from 'node:crypto';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { SubscriptionStatus } from '../../common/enums/subscription-status.enum';
import {
  RevenueAnalyticsAvailability,
  RevenueAnalyticsMovementType,
  RevenueAnalyticsNormalizationSource,
} from './revenue-analytics.enums';
import { RevenueLifecycleRepository } from './revenue-lifecycle.repository';
import {
  RevenueMovementRecord,
  RevenuePlanReadRecord,
  RevenueReconciliationResult,
  RevenueStateRecord,
  RevenueSubscriptionReadRecord,
} from './revenue-lifecycle.types';

const RECONCILIATION_BATCH_SIZE = 250;
const REVENUE_STATUSES = new Set<SubscriptionStatus>([
  SubscriptionStatus.ACTIVE,
  SubscriptionStatus.TRIALING,
]);

function utcDay(date: Date) {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}

function money(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

@Injectable()
export class RevenueLifecycleService implements OnModuleInit {
  private readonly logger = new Logger(RevenueLifecycleService.name);
  private running?: Promise<RevenueReconciliationResult>;

  constructor(private readonly repository: RevenueLifecycleRepository) {}

  async onModuleInit() {
    try {
      await this.reconcile();
    } catch (error) {
      this.logger.warn(
        `Initial revenue reconciliation failed: ${String(error)}`,
      );
    }
  }

  @Cron(CronExpression.EVERY_HOUR)
  async scheduledReconciliation() {
    try {
      await this.reconcile();
    } catch (error) {
      this.logger.error('Scheduled revenue reconciliation failed', error);
    }
  }

  reconcile(observedAt = new Date()): Promise<RevenueReconciliationResult> {
    if (this.running) return this.running;
    this.running = this.runReconciliation(observedAt).finally(() => {
      this.running = undefined;
    });
    return this.running;
  }

  private async runReconciliation(
    observedAt: Date,
  ): Promise<RevenueReconciliationResult> {
    const snapshotDate = utcDay(observedAt);
    let afterId: string | undefined;
    let subscriptionsRead = 0;
    let statesChanged = 0;
    let movementsRecorded = 0;
    let snapshotsWritten = 0;

    for (;;) {
      const subscriptions = await this.repository.listSubscriptions(
        afterId,
        RECONCILIATION_BATCH_SIZE,
      );
      if (subscriptions.length === 0) break;

      const organizationIds = subscriptions.map((item) => item.organizationId);
      const planIds = [...new Set(subscriptions.map((item) => item.planId))];
      const [plans, previousStates, cancellationDates] = await Promise.all([
        this.repository.findPlans(planIds),
        this.repository.findStates(organizationIds),
        this.repository.findLatestExecutedCancellations(organizationIds),
      ]);

      const states: RevenueStateRecord[] = [];
      const movements: RevenueMovementRecord[] = [];
      for (const subscription of subscriptions) {
        const next = this.stateFor(
          subscription,
          plans.get(subscription.planId),
          observedAt,
        );
        const previous = previousStates.get(subscription.organizationId);
        states.push(next);
        if (!previous || previous.fingerprint !== next.fingerprint) {
          statesChanged += 1;
          movements.push(
            ...this.movementsFor(
              previous,
              next,
              cancellationDates.get(subscription.organizationId),
            ),
          );
        }
      }

      await this.repository.persistBatch({ states, movements, snapshotDate });
      subscriptionsRead += subscriptions.length;
      movementsRecorded += movements.length;
      snapshotsWritten += states.length;
      afterId = subscriptions[subscriptions.length - 1].id;
      if (subscriptions.length < RECONCILIATION_BATCH_SIZE) break;
    }

    const coverage = await this.repository.sourceCoverage();
    return {
      observedAt: observedAt.toISOString(),
      snapshotDate: snapshotDate.toISOString(),
      subscriptionsRead,
      statesChanged,
      movementsRecorded,
      snapshotsWritten,
      coverage,
    };
  }

  private stateFor(
    subscription: RevenueSubscriptionReadRecord,
    plan: RevenuePlanReadRecord | undefined,
    observedAt: Date,
  ): RevenueStateRecord {
    const normalized = this.normalizeMonthlyRevenue(subscription, plan);
    const paused = Boolean(
      subscription.pausedUntil && subscription.pausedUntil > observedAt,
    );
    const revenueActive =
      REVENUE_STATUSES.has(subscription.status) &&
      !paused &&
      normalized.availability !== RevenueAnalyticsAvailability.UNAVAILABLE;
    const normalizedMrrUsd = revenueActive ? normalized.amountUsd : 0;
    const fingerprint = this.fingerprint({
      subscriptionId: subscription.id,
      planId: subscription.planId,
      status: subscription.status,
      billingInterval: subscription.billingInterval,
      normalizedMrrUsd,
      revenueActive,
      paused,
      isEstimated: normalized.isEstimated,
      availability: normalized.availability,
      normalizationSource: normalized.source,
      sourceUpdatedAt: subscription.updatedAt.toISOString(),
    });

    return {
      organizationId: subscription.organizationId,
      subscriptionId: subscription.id,
      planId: subscription.planId,
      status: subscription.status,
      billingInterval: subscription.billingInterval,
      normalizedMrrUsd,
      revenueActive,
      paused,
      isEstimated: normalized.isEstimated,
      availability: normalized.availability,
      normalizationSource: normalized.source,
      subscriptionStartedAt: subscription.createdAt,
      currentPeriodStart: subscription.currentPeriodStart,
      currentPeriodEnd: subscription.currentPeriodEnd,
      sourceUpdatedAt: subscription.updatedAt,
      observedAt,
      fingerprint,
    };
  }

  private normalizeMonthlyRevenue(
    subscription: RevenueSubscriptionReadRecord,
    plan: RevenuePlanReadRecord | undefined,
  ) {
    const addons = money(subscription.monthlyAddonRevenueUsd);
    if (subscription.billingInterval === 'year') {
      if (plan?.annualPriceUsd !== undefined) {
        return {
          amountUsd: money(plan.annualPriceUsd / 12 + addons),
          isEstimated: true,
          availability: RevenueAnalyticsAvailability.PARTIAL,
          source: RevenueAnalyticsNormalizationSource.PLAN_CATALOG,
        };
      }
      if (subscription.monthlyPriceUsd !== undefined) {
        return {
          amountUsd: money(subscription.monthlyPriceUsd + addons),
          isEstimated: true,
          availability: RevenueAnalyticsAvailability.PARTIAL,
          source: RevenueAnalyticsNormalizationSource.SUBSCRIPTION_SNAPSHOT,
        };
      }
    } else if (subscription.monthlyPriceUsd !== undefined) {
      return {
        amountUsd: money(subscription.monthlyPriceUsd + addons),
        isEstimated: false,
        availability: RevenueAnalyticsAvailability.AVAILABLE,
        source: RevenueAnalyticsNormalizationSource.SUBSCRIPTION_SNAPSHOT,
      };
    } else if (plan?.monthlyPriceUsd !== undefined) {
      return {
        amountUsd: money(plan.monthlyPriceUsd + addons),
        isEstimated: true,
        availability: RevenueAnalyticsAvailability.PARTIAL,
        source: RevenueAnalyticsNormalizationSource.PLAN_CATALOG,
      };
    }

    return {
      amountUsd: 0,
      isEstimated: false,
      availability: RevenueAnalyticsAvailability.UNAVAILABLE,
      source: RevenueAnalyticsNormalizationSource.UNAVAILABLE,
    };
  }

  private movementsFor(
    previous: RevenueStateRecord | undefined,
    next: RevenueStateRecord,
    cancellationDate?: Date,
  ) {
    if (!previous) {
      return [
        this.movement(RevenueAnalyticsMovementType.BASELINE, undefined, next),
      ];
    }

    const result: RevenueMovementRecord[] = [];
    if (!previous.paused && next.paused) {
      result.push(
        this.movement(RevenueAnalyticsMovementType.PAUSE, previous, next),
      );
      return result;
    } else if (previous.paused && !next.paused) {
      result.push(
        this.movement(RevenueAnalyticsMovementType.RESUME, previous, next),
      );
      return result;
    }

    if (previous.revenueActive && !next.revenueActive) {
      const type =
        next.status === SubscriptionStatus.CANCELED
          ? RevenueAnalyticsMovementType.CHURN
          : RevenueAnalyticsMovementType.SUSPENSION;
      result.push(
        this.movement(
          type,
          previous,
          next,
          type === RevenueAnalyticsMovementType.CHURN
            ? cancellationDate
            : undefined,
        ),
      );
      return result;
    }

    if (!previous.revenueActive && next.revenueActive) {
      const type =
        previous.status === SubscriptionStatus.CANCELED
          ? RevenueAnalyticsMovementType.REACTIVATION
          : RevenueAnalyticsMovementType.RECOVERY;
      result.push(this.movement(type, previous, next));
      return result;
    }

    if (previous.revenueActive && next.revenueActive) {
      const delta = money(next.normalizedMrrUsd - previous.normalizedMrrUsd);
      if (delta > 0) {
        result.push(
          this.movement(RevenueAnalyticsMovementType.EXPANSION, previous, next),
        );
      } else if (delta < 0) {
        result.push(
          this.movement(
            RevenueAnalyticsMovementType.CONTRACTION,
            previous,
            next,
          ),
        );
      } else if (previous.planId !== next.planId) {
        result.push(
          this.movement(
            RevenueAnalyticsMovementType.PLAN_CHANGE,
            previous,
            next,
          ),
        );
      }
    }

    return result;
  }

  private movement(
    type: RevenueAnalyticsMovementType,
    previous: RevenueStateRecord | undefined,
    next: RevenueStateRecord,
    effectiveAt?: Date,
  ): RevenueMovementRecord {
    const previousMrrUsd = previous?.normalizedMrrUsd ?? 0;
    const nextMrrUsd = next.normalizedMrrUsd;
    return {
      dedupeKey: this.fingerprint({
        organizationId: next.organizationId,
        type,
        previousFingerprint: previous?.fingerprint ?? null,
        nextFingerprint: next.fingerprint,
      }),
      organizationId: next.organizationId,
      subscriptionId: next.subscriptionId,
      type,
      previousPlanId: previous?.planId,
      nextPlanId: next.planId,
      previousStatus: previous?.status,
      nextStatus: next.status,
      previousMrrUsd,
      nextMrrUsd,
      deltaMrrUsd: money(nextMrrUsd - previousMrrUsd),
      isEstimated: previous?.isEstimated === true || next.isEstimated,
      normalizationSource: next.normalizationSource,
      effectiveAt: effectiveAt ?? next.sourceUpdatedAt,
      observedAt: next.observedAt,
    };
  }

  private fingerprint(value: Record<string, unknown>) {
    return createHash('sha256').update(JSON.stringify(value)).digest('hex');
  }
}
