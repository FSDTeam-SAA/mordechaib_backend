import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  RevenueAnalyticsAvailability,
  RevenueAnalyticsCurrency,
  RevenueAnalyticsMeasurementBasis,
  RevenueAnalyticsMetricKey,
} from './revenue-analytics.enums';

export class RevenueMetricValueResponse {
  @ApiProperty({ enum: RevenueAnalyticsMetricKey })
  key!: RevenueAnalyticsMetricKey;

  @ApiProperty()
  label!: string;

  @ApiProperty({ nullable: true, type: Number })
  value!: number | null;

  @ApiProperty({ example: 'PERCENT' })
  unit!: 'PERCENT' | 'CURRENCY_USD' | 'RATIO';

  @ApiProperty({ enum: RevenueAnalyticsAvailability })
  availability!: RevenueAnalyticsAvailability;

  @ApiProperty({ enum: RevenueAnalyticsMeasurementBasis })
  basis!: RevenueAnalyticsMeasurementBasis;

  @ApiProperty()
  isEstimated!: boolean;

  @ApiPropertyOptional({ nullable: true, type: Number })
  numerator?: number | null;

  @ApiPropertyOptional({ nullable: true, type: Number })
  denominator?: number | null;

  @ApiPropertyOptional()
  note?: string;
}

export class RevenueRetentionTrendPointResponse {
  @ApiProperty({ format: 'date-time' })
  periodStart!: string;

  @ApiProperty({ format: 'date-time' })
  periodEnd!: string;

  @ApiProperty({ example: 'Nov 2026' })
  label!: string;

  @ApiProperty()
  openingOrganizations!: number;

  @ApiProperty()
  churnedOrganizations!: number;

  @ApiProperty()
  openingMrrUsd!: number;

  @ApiProperty()
  expansionMrrUsd!: number;

  @ApiProperty()
  contractionMrrUsd!: number;

  @ApiProperty()
  churnedMrrUsd!: number;

  @ApiProperty({ nullable: true, type: Number })
  logoChurnRate!: number | null;

  @ApiProperty({ nullable: true, type: Number })
  revenueChurnRate!: number | null;

  @ApiProperty({ nullable: true, type: Number })
  netRevenueRetention!: number | null;

  @ApiProperty({ enum: RevenueAnalyticsAvailability })
  availability!: RevenueAnalyticsAvailability;
}

export class RevenuePlanLtvResponse {
  @ApiProperty()
  planId!: string;

  @ApiProperty()
  planName!: string;

  @ApiProperty()
  organizationsWithPaidInvoices!: number;

  @ApiProperty()
  paidInvoices!: number;

  @ApiProperty()
  realizedRevenueUsd!: number;

  @ApiProperty({ nullable: true, type: Number })
  averageRealizedLtvUsd!: number | null;

  @ApiProperty({ enum: RevenueAnalyticsAvailability })
  availability!: RevenueAnalyticsAvailability;

  @ApiProperty()
  isEstimated!: boolean;
}

export class RevenueCohortCellResponse {
  @ApiProperty({ example: 0 })
  month!: number;

  @ApiProperty({ nullable: true, type: Number })
  retainedOrganizations!: number | null;

  @ApiProperty({ nullable: true, type: Number })
  retentionRate!: number | null;

  @ApiProperty({ enum: RevenueAnalyticsAvailability })
  availability!: RevenueAnalyticsAvailability;
}

export class RevenueCohortResponse {
  @ApiProperty({ example: '2026-11' })
  cohort!: string;

  @ApiProperty()
  originalOrganizations!: number;

  @ApiProperty({ type: [RevenueCohortCellResponse] })
  months!: RevenueCohortCellResponse[];
}

export class RevenueRetentionCoverageResponse {
  @ApiProperty()
  expectedOpeningOrganizations!: number;

  @ApiProperty()
  snapshottedOpeningOrganizations!: number;

  @ApiProperty()
  movements!: number;

  @ApiProperty()
  paidInvoiceOrganizations!: number;

  @ApiProperty({ format: 'date-time', nullable: true, type: String })
  trackingStartedAt!: string | null;
}

export class RevenueRetentionResponse {
  @ApiProperty({ example: '1.0' })
  schemaVersion!: string;

  @ApiProperty({ example: '1.0' })
  methodologyVersion!: string;

  @ApiProperty({ enum: RevenueAnalyticsCurrency })
  currency!: RevenueAnalyticsCurrency;

  @ApiProperty({ format: 'date-time' })
  from!: string;

  @ApiProperty({ format: 'date-time' })
  to!: string;

  @ApiProperty()
  timezone!: string;

  @ApiProperty({ format: 'date-time' })
  generatedAt!: string;

  @ApiProperty({ type: [RevenueMetricValueResponse] })
  summary!: RevenueMetricValueResponse[];

  @ApiProperty({ type: [RevenueRetentionTrendPointResponse] })
  trend!: RevenueRetentionTrendPointResponse[];

  @ApiProperty({ type: [RevenuePlanLtvResponse] })
  lifetimeValueByPlan!: RevenuePlanLtvResponse[];

  @ApiProperty({ type: [RevenueCohortResponse] })
  cohorts!: RevenueCohortResponse[];

  @ApiProperty({ type: RevenueRetentionCoverageResponse })
  coverage!: RevenueRetentionCoverageResponse;
}
