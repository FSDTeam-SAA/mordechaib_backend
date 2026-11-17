import { IsEnum, IsIn, IsOptional, IsUrl } from 'class-validator';
import { PlanType } from '../../../common/enums/plan-type.enum';

export class CreateCheckoutSessionDto {
  @IsEnum(PlanType)
  planType!: PlanType;

  @IsOptional()
  @IsIn(['month', 'year'])
  billingCycle?: 'month' | 'year';

  @IsUrl({ require_tld: false })
  successUrl!: string;

  @IsUrl({ require_tld: false })
  cancelUrl!: string;
}
