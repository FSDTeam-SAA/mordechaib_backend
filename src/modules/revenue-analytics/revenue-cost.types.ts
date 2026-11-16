import {
  RevenueAnalyticsAvailability,
  RevenueCostPricingSource,
  RevenueServiceProvider,
  RevenueUsageUnit,
} from './revenue-analytics.enums';

export type RevenueCostCursorRecord = {
  lastUpdatedAt: Date;
  lastSourceObjectId: string;
};

export type RevenueCostSourceRecord = {
  id: string;
  organizationId: string;
  updatedAt: Date;
  occurredAt: Date;
  quantity: number;
  unit: RevenueUsageUnit;
  sourceType: string;
  inputTokens?: number;
  outputTokens?: number;
  model?: string;
  providerCostUsd?: number;
};

export type RevenueServiceCostRecord = {
  dedupeKey: string;
  organizationId: string;
  provider: RevenueServiceProvider;
  sourceType: string;
  sourceId: string;
  quantity: number;
  unit: RevenueUsageUnit;
  inputTokens?: number;
  outputTokens?: number;
  model?: string;
  costUsd?: number;
  fallbackRateUsd?: number;
  isEstimated: boolean;
  pricingSource: RevenueCostPricingSource;
  availability: RevenueAnalyticsAvailability;
  occurredAt: Date;
};

export type RevenueCostAggregateRecord = {
  provider: RevenueServiceProvider;
  eventCount: number;
  quantity: number;
  costUsd: number;
  costAvailableEvents: number;
  estimatedEvents: number;
};

export type RevenueCostTrendRecord = RevenueCostAggregateRecord & {
  period: string;
};

export type RevenuePaidRevenueTrendRecord = {
  period: string;
  revenueUsd: number;
};
