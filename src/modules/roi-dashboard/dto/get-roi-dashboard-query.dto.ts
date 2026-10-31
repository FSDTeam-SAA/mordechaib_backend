import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';

export enum RoiDashboardRange {
  DAYS_7 = '7_DAYS',
  DAYS_30 = '30_DAYS',
  DAYS_90 = '90_DAYS',
}

export class GetRoiDashboardQueryDto {
  @ApiPropertyOptional({
    enum: RoiDashboardRange,
    default: RoiDashboardRange.DAYS_30,
  })
  @IsOptional()
  @IsEnum(RoiDashboardRange)
  range: RoiDashboardRange = RoiDashboardRange.DAYS_30;
}

export function roiRangeDays(range: RoiDashboardRange) {
  switch (range) {
    case RoiDashboardRange.DAYS_7:
      return 7;
    case RoiDashboardRange.DAYS_90:
      return 90;
    default:
      return 30;
  }
}
