import { SubscriptionStatus } from '../../common/enums/subscription-status.enum';
import {
  RevenueAnalyticsAvailability,
  RevenueAnalyticsMovementType,
  RevenueAnalyticsNormalizationSource,
} from './revenue-analytics.enums';

export type RevenueSubscriptionReadRecord = {
  id: string;
  organizationId: string;
  planId: string;
  status: SubscriptionStatus;
  billingInterval?: 'month' | 'year';
  pausedUntil?: Date;
  currentPeriodStart?: Date;
  currentPeriodEnd?: Date;
  createdAt?: Date;
  updatedAt: Date;
  monthlyPriceUsd?: number;
  monthlyAddonRevenueUsd: number;
};

export type RevenuePlanReadRecord = {
  id: string;
  monthlyPriceUsd?: number;
  annualPriceUsd?: number;
};

export type RevenueStateRecord = {
  organizationId: string;
  subscriptionId: string;
  planId: string;
  status: SubscriptionStatus;
  billingInterval?: 'month' | 'year';
  normalizedMrrUsd: number;
  revenueActive: boolean;
  paused: boolean;
  isEstimated: boolean;
  availability: RevenueAnalyticsAvailability;
  normalizationSource: RevenueAnalyticsNormalizationSource;
  subscriptionStartedAt?: Date;
  currentPeriodStart?: Date;
  currentPeriodEnd?: Date;
  sourceUpdatedAt: Date;
  observedAt: Date;
  fingerprint: string;
};

export type RevenueMovementRecord = {
  dedupeKey: string;
  organizationId: string;
  subscriptionId: string;
  type: RevenueAnalyticsMovementType;
  previousPlanId?: string;
  nextPlanId?: string;
  previousStatus?: SubscriptionStatus;
  nextStatus?: SubscriptionStatus;
  previousMrrUsd: number;
  nextMrrUsd: number;
  deltaMrrUsd: number;
  isEstimated: boolean;
  normalizationSource: RevenueAnalyticsNormalizationSource;
  effectiveAt: Date;
  observedAt: Date;
};

export type RevenueReconciliationResult = {
  observedAt: string;
  snapshotDate: string;
  subscriptionsRead: number;
  statesChanged: number;
  movementsRecorded: number;
  snapshotsWritten: number;
  coverage: {
    paidInvoices: number;
    executedCancellations: number;
  };
};

export type RevenueSnapshotReadRecord = {
  snapshotDate: Date;
  organizationId: string;
  planId: string;
  normalizedMrrUsd: number;
  revenueActive: boolean;
  isEstimated: boolean;
  availability: RevenueAnalyticsAvailability;
  subscriptionStartedAt?: Date;
  observedAt: Date;
};

export type RevenueMovementReadRecord = RevenueMovementRecord;

export type RevenueLifetimeInvoiceRecord = {
  organizationId: string;
  planId?: string;
  paidRevenueUsd: number;
  firstPaidAt: Date;
  lastPaidAt: Date;
  invoiceCount: number;
};

export type RevenueCohortOrganizationRecord = {
  organizationId: string;
  planId: string;
  subscriptionStartedAt: Date;
};

export type RevenuePlanLabelRecord = {
  id: string;
  name: string;
};
