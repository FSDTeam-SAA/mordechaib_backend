import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  RevenueAcquisitionChannel,
  RevenueAnalyticsAvailability,
} from './revenue-analytics.enums';

export class RevenueAcquisitionCostResponse {
  @ApiProperty()
  id!: string;

  @ApiProperty({ example: '2026-11' })
  period!: string;

  @ApiProperty({ enum: RevenueAcquisitionChannel })
  channel!: RevenueAcquisitionChannel;

  @ApiProperty()
  salesCostUsd!: number;

  @ApiProperty()
  marketingCostUsd!: number;

  @ApiProperty()
  totalCostUsd!: number;

  @ApiProperty({ enum: ['USD'] })
  currency!: 'USD';

  @ApiPropertyOptional()
  notes?: string;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ format: 'date-time' })
  updatedAt!: string;
}

export class RevenueAcquisitionCostPaginationResponse {
  @ApiProperty()
  page!: number;

  @ApiProperty()
  limit!: number;

  @ApiProperty()
  total!: number;

  @ApiProperty()
  pages!: number;
}

export class RevenueAcquisitionCostListResponse {
  @ApiProperty({ type: [RevenueAcquisitionCostResponse] })
  items!: RevenueAcquisitionCostResponse[];

  @ApiProperty({ type: RevenueAcquisitionCostPaginationResponse })
  pagination!: RevenueAcquisitionCostPaginationResponse;
}

export class RevenueAcquisitionCostImportResponse {
  @ApiProperty()
  processed!: number;

  @ApiProperty()
  created!: number;

  @ApiProperty()
  updated!: number;

  @ApiProperty()
  unchanged!: number;
}

export class RevenueAcquisitionChannelBreakdownResponse {
  @ApiProperty({ enum: RevenueAcquisitionChannel })
  channel!: RevenueAcquisitionChannel;

  @ApiProperty()
  salesCostUsd!: number;

  @ApiProperty()
  marketingCostUsd!: number;

  @ApiProperty()
  totalCostUsd!: number;
}

export class RevenueAcquisitionAnalyticsResponse {
  @ApiProperty()
  salesCostUsd!: number;

  @ApiProperty()
  marketingCostUsd!: number;

  @ApiProperty()
  totalCostUsd!: number;

  @ApiProperty()
  newlyAcquiredOrganizations!: number;

  @ApiProperty()
  coveredMonths!: number;

  @ApiProperty()
  expectedMonths!: number;

  @ApiProperty({ enum: RevenueAnalyticsAvailability })
  availability!: RevenueAnalyticsAvailability;

  @ApiProperty({ type: [RevenueAcquisitionChannelBreakdownResponse] })
  channels!: RevenueAcquisitionChannelBreakdownResponse[];
}
