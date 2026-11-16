import { Injectable } from '@nestjs/common';
import {
  REVENUE_ANALYTICS_CURRENCY,
  REVENUE_ANALYTICS_MAX_RANGE_DAYS,
  REVENUE_ANALYTICS_METHODOLOGY_VERSION,
  REVENUE_ANALYTICS_SCHEMA_VERSION,
  REVENUE_METRIC_DEFINITIONS,
} from './revenue-analytics.constants';
import { RevenueAnalyticsAvailability } from './revenue-analytics.enums';
import { RevenueAnalyticsMethodologyResponse } from './revenue-analytics.types';

@Injectable()
export class RevenueAnalyticsService {
  methodology(): RevenueAnalyticsMethodologyResponse {
    return {
      schemaVersion: REVENUE_ANALYTICS_SCHEMA_VERSION,
      methodologyVersion: REVENUE_ANALYTICS_METHODOLOGY_VERSION,
      currency: REVENUE_ANALYTICS_CURRENCY,
      maximumRangeDays: REVENUE_ANALYTICS_MAX_RANGE_DAYS,
      periodBoundary: '[from, to)',
      annualMrrNormalization: 'annualRecurringAmountUsd / 12',
      dataPolicies: [
        'Subscription, invoice, and cancellation records are read-only inputs; Revenue Analytics never mutates billing state.',
        'Missing or insufficient source data is unavailable, never zero.',
        'Partial source coverage cannot be presented as an organization-wide or platform-wide measured result.',
        'Every configured or model-derived estimate is explicitly marked isEstimated=true.',
        'Measured provider cost is preferred over configured fallback cost.',
        'All persisted monetary values use USD in methodology version 1.0.',
        'Sales and marketing costs are entered per calendar month and channel; partial-month reports allocate those costs by elapsed calendar time in the requested timezone.',
        'Blended CAC does not claim channel attribution because organizations are not yet linked to an authoritative acquisition channel.',
        'Annual recurring revenue is normalized to monthly recurring revenue by dividing the annual amount by 12.',
        'Annual subscriptions retain monthly usage entitlement periods; analytics does not modify subscription enforcement.',
      ],
      availabilitySemantics: [
        {
          value: RevenueAnalyticsAvailability.AVAILABLE,
          meaning:
            'The required authoritative sources cover the complete requested scope.',
        },
        {
          value: RevenueAnalyticsAvailability.PARTIAL,
          meaning:
            'Some authoritative data exists, but source or period coverage is incomplete.',
        },
        {
          value: RevenueAnalyticsAvailability.UNAVAILABLE,
          meaning:
            'The required authoritative source data is absent; this never means zero.',
        },
      ],
      metrics: REVENUE_METRIC_DEFINITIONS.map((metric) => ({
        ...metric,
        requiredSources: [...metric.requiredSources],
      })),
    };
  }
}
