import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';

export enum CrmDashboardPeriod {
  DAYS_7 = '7_DAYS',
  DAYS_30 = '30_DAYS',
}

export class GetCrmDashboardSummaryQueryDto {
  @ApiPropertyOptional({
    enum: CrmDashboardPeriod,
    default: CrmDashboardPeriod.DAYS_7,
    description: 'Trend and comparison period for the CRM summary cards.',
  })
  @IsOptional()
  @IsEnum(CrmDashboardPeriod)
  period: CrmDashboardPeriod = CrmDashboardPeriod.DAYS_7;
}

export function crmDashboardPeriodConfiguration(period: CrmDashboardPeriod) {
  if (period === CrmDashboardPeriod.DAYS_30) {
    return { days: 30 } as const;
  }

  return { days: 7 } as const;
}
