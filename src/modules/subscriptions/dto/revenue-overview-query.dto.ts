import { IsEnum, IsOptional } from 'class-validator';

export enum RevenueOverviewRange {
  YEARLY = 'yearly',
}

export class RevenueOverviewQueryDto {
  @IsOptional()
  @IsEnum(RevenueOverviewRange)
  range?: RevenueOverviewRange = RevenueOverviewRange.YEARLY;
}