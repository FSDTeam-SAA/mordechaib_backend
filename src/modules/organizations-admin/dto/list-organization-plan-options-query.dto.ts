import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';

export class ListOrganizationPlanOptionsQueryDto {
  @ApiPropertyOptional({
    enum: ['month', 'year'],
    description:
      'Billing interval displayed by the plan selector. Defaults to the current subscription interval, then month.',
  })
  @IsOptional()
  @IsIn(['month', 'year'])
  billingInterval?: 'month' | 'year';
}
