import {
  RevenueAnalyticsCurrency,
  RevenueAnalyticsMeasurementBasis,
  RevenueAnalyticsMetricKey,
  RevenueAnalyticsSourceKey,
} from './revenue-analytics.enums';

export const REVENUE_ANALYTICS_SCHEMA_VERSION = '1.0' as const;
export const REVENUE_ANALYTICS_METHODOLOGY_VERSION = '1.0' as const;
export const REVENUE_ANALYTICS_CURRENCY = RevenueAnalyticsCurrency.USD as const;
export const REVENUE_ANALYTICS_MAX_RANGE_DAYS = 366;

export type RevenueMetricDefinition = {
  key: RevenueAnalyticsMetricKey;
  label: string;
  basis: RevenueAnalyticsMeasurementBasis;
  formula: string;
  requiredSources: RevenueAnalyticsSourceKey[];
  notes?: string;
};

export const REVENUE_METRIC_DEFINITIONS: readonly RevenueMetricDefinition[] = [
  {
    key: RevenueAnalyticsMetricKey.LOGO_CHURN_RATE,
    label: 'Logo churn rate',
    basis: RevenueAnalyticsMeasurementBasis.DERIVED,
    formula:
      'organizationsChurnedDuringPeriod / organizationsActiveAtPeriodStart * 100',
    requiredSources: [RevenueAnalyticsSourceKey.SUBSCRIPTIONS],
    notes:
      'Trial expiration and paused organizations are excluded. Cancellation counts only when it becomes effective.',
  },
  {
    key: RevenueAnalyticsMetricKey.REVENUE_CHURN_RATE,
    label: 'Revenue churn rate',
    basis: RevenueAnalyticsMeasurementBasis.DERIVED,
    formula: 'churnedMrr / openingMrr * 100',
    requiredSources: [RevenueAnalyticsSourceKey.SUBSCRIPTIONS],
  },
  {
    key: RevenueAnalyticsMetricKey.NET_REVENUE_RETENTION,
    label: 'Net revenue retention',
    basis: RevenueAnalyticsMeasurementBasis.DERIVED,
    formula:
      '(openingMrr + expansionMrr - contractionMrr - churnedMrr) / openingMrr * 100',
    requiredSources: [RevenueAnalyticsSourceKey.SUBSCRIPTIONS],
    notes: 'New-customer revenue is excluded from NRR.',
  },
  {
    key: RevenueAnalyticsMetricKey.REALIZED_LTV,
    label: 'Realized customer lifetime value',
    basis: RevenueAnalyticsMeasurementBasis.MEASURED,
    formula: 'sum(paidInvoiceRevenue) per organization or cohort',
    requiredSources: [RevenueAnalyticsSourceKey.INVOICES],
  },
  {
    key: RevenueAnalyticsMetricKey.ESTIMATED_LTV,
    label: 'Estimated customer lifetime value',
    basis: RevenueAnalyticsMeasurementBasis.ESTIMATED,
    formula: 'averageRevenuePerOrganization * grossMarginRate / logoChurnRate',
    requiredSources: [
      RevenueAnalyticsSourceKey.SUBSCRIPTIONS,
      RevenueAnalyticsSourceKey.INVOICES,
      RevenueAnalyticsSourceKey.AI_USAGE,
      RevenueAnalyticsSourceKey.TWILIO_USAGE,
      RevenueAnalyticsSourceKey.RECALL_MEETING_USAGE,
    ],
    notes:
      'Returned only when the churn denominator and cost coverage are sufficient; always marked estimated.',
  },
  {
    key: RevenueAnalyticsMetricKey.LTV_CAC_RATIO,
    label: 'LTV to CAC ratio',
    basis: RevenueAnalyticsMeasurementBasis.DERIVED,
    formula: 'estimatedLtv / customerAcquisitionCost',
    requiredSources: [
      RevenueAnalyticsSourceKey.ACQUISITION_COSTS,
      RevenueAnalyticsSourceKey.SUBSCRIPTIONS,
      RevenueAnalyticsSourceKey.INVOICES,
    ],
  },
  {
    key: RevenueAnalyticsMetricKey.COHORT_RETENTION,
    label: 'Cohort retention',
    basis: RevenueAnalyticsMeasurementBasis.DERIVED,
    formula:
      'organizationsRetainedAtCohortMonth / organizationsInOriginalCohort * 100',
    requiredSources: [RevenueAnalyticsSourceKey.SUBSCRIPTIONS],
  },
  {
    key: RevenueAnalyticsMetricKey.GROSS_MARGIN,
    label: 'Gross margin',
    basis: RevenueAnalyticsMeasurementBasis.DERIVED,
    formula:
      '(recognizedRevenue - attributableServiceCost) / recognizedRevenue * 100',
    requiredSources: [
      RevenueAnalyticsSourceKey.INVOICES,
      RevenueAnalyticsSourceKey.AI_USAGE,
      RevenueAnalyticsSourceKey.TWILIO_USAGE,
      RevenueAnalyticsSourceKey.RECALL_MEETING_USAGE,
    ],
  },
  {
    key: RevenueAnalyticsMetricKey.COST_PER_AI_TASK,
    label: 'Cost per AI task',
    basis: RevenueAnalyticsMeasurementBasis.DERIVED,
    formula: 'attributableAiCost / completedBillableAiOperations',
    requiredSources: [RevenueAnalyticsSourceKey.AI_USAGE],
  },
  {
    key: RevenueAnalyticsMetricKey.COST_PER_ORGANIZATION,
    label: 'Cost per organization',
    basis: RevenueAnalyticsMeasurementBasis.DERIVED,
    formula: 'attributableServiceCost / activeOrganizations',
    requiredSources: [
      RevenueAnalyticsSourceKey.SUBSCRIPTIONS,
      RevenueAnalyticsSourceKey.AI_USAGE,
      RevenueAnalyticsSourceKey.TWILIO_USAGE,
      RevenueAnalyticsSourceKey.RECALL_MEETING_USAGE,
    ],
  },
  {
    key: RevenueAnalyticsMetricKey.CUSTOMER_ACQUISITION_COST,
    label: 'Customer acquisition cost',
    basis: RevenueAnalyticsMeasurementBasis.DERIVED,
    formula: 'salesAndMarketingCost / newlyAcquiredOrganizations',
    requiredSources: [
      RevenueAnalyticsSourceKey.ACQUISITION_COSTS,
      RevenueAnalyticsSourceKey.SUBSCRIPTIONS,
    ],
  },
  {
    key: RevenueAnalyticsMetricKey.CAC_PAYBACK_PERIOD,
    label: 'CAC payback period',
    basis: RevenueAnalyticsMeasurementBasis.DERIVED,
    formula:
      'customerAcquisitionCost / averageMonthlyGrossProfitPerOrganization',
    requiredSources: [
      RevenueAnalyticsSourceKey.ACQUISITION_COSTS,
      RevenueAnalyticsSourceKey.SUBSCRIPTIONS,
      RevenueAnalyticsSourceKey.INVOICES,
      RevenueAnalyticsSourceKey.AI_USAGE,
      RevenueAnalyticsSourceKey.TWILIO_USAGE,
      RevenueAnalyticsSourceKey.RECALL_MEETING_USAGE,
    ],
  },
] as const;
