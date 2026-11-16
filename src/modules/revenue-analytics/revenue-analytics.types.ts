import { ApiProperty } from '@nestjs/swagger';
import {
  RevenueAnalyticsAvailability,
  RevenueAnalyticsCurrency,
  RevenueAnalyticsMeasurementBasis,
  RevenueAnalyticsMetricKey,
  RevenueAnalyticsSourceKey,
} from './revenue-analytics.enums';

export class RevenueAnalyticsAvailabilitySemanticsResponse {
  @ApiProperty({ enum: RevenueAnalyticsAvailability })
  value!: RevenueAnalyticsAvailability;

  @ApiProperty()
  meaning!: string;
}

export class RevenueAnalyticsMetricMethodologyResponse {
  @ApiProperty({ enum: RevenueAnalyticsMetricKey })
  key!: RevenueAnalyticsMetricKey;

  @ApiProperty()
  label!: string;

  @ApiProperty({ enum: RevenueAnalyticsMeasurementBasis })
  basis!: RevenueAnalyticsMeasurementBasis;

  @ApiProperty()
  formula!: string;

  @ApiProperty({ enum: RevenueAnalyticsSourceKey, isArray: true })
  requiredSources!: RevenueAnalyticsSourceKey[];

  @ApiProperty({ required: false })
  notes?: string;
}

export class RevenueAnalyticsMethodologyResponse {
  @ApiProperty({ example: '1.0' })
  schemaVersion!: string;

  @ApiProperty({ example: '1.0' })
  methodologyVersion!: string;

  @ApiProperty({ enum: RevenueAnalyticsCurrency })
  currency!: RevenueAnalyticsCurrency;

  @ApiProperty({ example: 366 })
  maximumRangeDays!: number;

  @ApiProperty({
    example: '[from, to)',
    description:
      'All analytics periods use an inclusive start and exclusive end.',
  })
  periodBoundary!: string;

  @ApiProperty({
    example: 'annualRecurringAmountUsd / 12',
  })
  annualMrrNormalization!: string;

  @ApiProperty({
    type: [String],
    example: [
      'Missing data is unavailable, never zero.',
      'Every estimated value is explicitly marked isEstimated=true.',
    ],
  })
  dataPolicies!: string[];

  @ApiProperty({ type: [RevenueAnalyticsAvailabilitySemanticsResponse] })
  availabilitySemantics!: RevenueAnalyticsAvailabilitySemanticsResponse[];

  @ApiProperty({ type: [RevenueAnalyticsMetricMethodologyResponse] })
  metrics!: RevenueAnalyticsMetricMethodologyResponse[];
}
