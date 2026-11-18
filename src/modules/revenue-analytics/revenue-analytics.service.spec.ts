import {
  RevenueAnalyticsAvailability,
  RevenueAnalyticsCurrency,
  RevenueAnalyticsMeasurementBasis,
  RevenueAnalyticsMetricKey,
} from './revenue-analytics.enums';
import { RevenueAnalyticsService } from './revenue-analytics.service';

describe('RevenueAnalyticsService', () => {
  const service = new RevenueAnalyticsService();

  it('publishes a stable USD-only methodology without mutating billing inputs', () => {
    const result = service.methodology();

    expect(result).toMatchObject({
      schemaVersion: '1.0',
      methodologyVersion: '1.0',
      currency: RevenueAnalyticsCurrency.USD,
      periodBoundary: '[from, to)',
      annualMrrNormalization: 'annualRecurringAmountUsd / 12',
    });
    expect(result.dataPolicies).toEqual(
      expect.arrayContaining([
        expect.stringContaining('read-only inputs'),
        expect.stringContaining('unavailable, never zero'),
        expect.stringContaining('isEstimated=true'),
      ]),
    );
    expect(result.availabilitySemantics.map((item) => item.value)).toEqual(
      Object.values(RevenueAnalyticsAvailability),
    );
  });

  it('defines every dashboard metric and discloses estimated LTV', () => {
    const result = service.methodology();
    const keys = new Set(result.metrics.map((metric) => metric.key));

    expect(keys.size).toBe(Object.values(RevenueAnalyticsMetricKey).length);
    expect(keys).toEqual(new Set(Object.values(RevenueAnalyticsMetricKey)));
    expect(
      result.metrics.find(
        (metric) => metric.key === RevenueAnalyticsMetricKey.ESTIMATED_LTV,
      ),
    ).toMatchObject({
      basis: RevenueAnalyticsMeasurementBasis.ESTIMATED,
    });
  });

  it('returns defensive copies of metric source arrays', () => {
    const first = service.methodology();
    first.metrics[0].requiredSources.length = 0;

    const second = service.methodology();
    expect(second.metrics[0].requiredSources.length).toBeGreaterThan(0);
  });
});
