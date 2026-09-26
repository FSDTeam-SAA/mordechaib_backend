import { IsEnum, IsISO8601, IsOptional } from 'class-validator';
import { IntegrationProvider } from '../../../database/schemas/integration.schema';

export enum CrmRevenueGroupBy {
  STAGE = 'stage',
  MONTH = 'month',
}

export class CrmRevenueQueryDto {
  @IsOptional()
  @IsEnum(IntegrationProvider)
  provider?: IntegrationProvider;

  @IsOptional()
  @IsEnum(CrmRevenueGroupBy)
  groupBy: CrmRevenueGroupBy = CrmRevenueGroupBy.STAGE;

  @IsOptional()
  @IsISO8601({ strict: true })
  from?: string;

  @IsOptional()
  @IsISO8601({ strict: true })
  to?: string;
}
