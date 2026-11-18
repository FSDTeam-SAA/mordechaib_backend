import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  RevenueAnalyticsAvailability,
  RevenueAnalyticsCurrency,
  RevenueAnalyticsMeasurementBasis,
  RevenueAnalyticsMetricKey,
  RevenueServiceProvider,
} from './revenue-analytics.enums';
import { RevenueAcquisitionAnalyticsResponse } from './revenue-acquisition-cost.types';

export class RevenueUnitEconomicsMetricResponse {
  @ApiProperty({ enum: RevenueAnalyticsMetricKey })
  key!: RevenueAnalyticsMetricKey;

  @ApiProperty()
  label!: string;

  @ApiProperty({ nullable: true, type: Number })
  value!: number | null;

  @ApiProperty({ enum: ['PERCENT', 'CURRENCY_USD', 'MONTH', 'RATIO'] })
  unit!: 'PERCENT' | 'CURRENCY_USD' | 'MONTH' | 'RATIO';

  @ApiProperty({ enum: RevenueAnalyticsAvailability })
  availability!: RevenueAnalyticsAvailability;

  @ApiProperty({ enum: RevenueAnalyticsMeasurementBasis })
  basis!: RevenueAnalyticsMeasurementBasis;

  @ApiProperty()
  isEstimated!: boolean;

  @ApiPropertyOptional()
  note?: string;
}

export class RevenueProviderCostResponse {
  @ApiProperty({ enum: RevenueServiceProvider })
  provider!: RevenueServiceProvider;

  @ApiProperty()
  eventCount!: number;

  @ApiProperty()
  costAvailableEvents!: number;

  @ApiProperty({ nullable: true, type: Number })
  costUsd!: number | null;

  @ApiProperty({ enum: RevenueAnalyticsAvailability })
  availability!: RevenueAnalyticsAvailability;

  @ApiProperty()
  isEstimated!: boolean;
}

export class RevenueUnitEconomicsTrendProviderResponse extends RevenueProviderCostResponse {}

export class RevenueUnitEconomicsTrendPointResponse {
  @ApiProperty({ example: '2026-11' })
  period!: string;

  @ApiProperty()
  revenueUsd!: number;

  @ApiProperty({ nullable: true, type: Number })
  serviceCostUsd!: number | null;

  @ApiProperty({ nullable: true, type: Number })
  grossMarginPercent!: number | null;

  @ApiProperty({ enum: RevenueAnalyticsAvailability })
  availability!: RevenueAnalyticsAvailability;

  @ApiProperty()
  isEstimated!: boolean;

  @ApiProperty({ type: [RevenueUnitEconomicsTrendProviderResponse] })
  providers!: RevenueUnitEconomicsTrendProviderResponse[];
}

export class RevenueUnitEconomicsCoverageResponse {
  @ApiProperty()
  totalCostEvents!: number;

  @ApiProperty()
  costAvailableEvents!: number;

  @ApiProperty()
  estimatedCostEvents!: number;

  @ApiProperty()
  activeOrganizations!: number;
}

export class RevenueUnitEconomicsResponse {
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

  @ApiProperty()
  revenueUsd!: number;

  @ApiProperty({ type: [RevenueUnitEconomicsMetricResponse] })
  summary!: RevenueUnitEconomicsMetricResponse[];

  @ApiProperty({ type: [RevenueProviderCostResponse] })
  providerCosts!: RevenueProviderCostResponse[];

  @ApiProperty({ type: RevenueAcquisitionAnalyticsResponse })
  acquisitionCosts!: RevenueAcquisitionAnalyticsResponse;

  @ApiProperty({ type: [RevenueUnitEconomicsTrendPointResponse] })
  trend!: RevenueUnitEconomicsTrendPointResponse[];

  @ApiProperty({ type: RevenueUnitEconomicsCoverageResponse })
  coverage!: RevenueUnitEconomicsCoverageResponse;
}
