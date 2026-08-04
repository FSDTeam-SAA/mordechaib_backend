import { IsEnum, IsUrl } from 'class-validator';
import { PlanType } from '../../../common/enums/plan-type.enum';

export class CreateCheckoutSessionDto {
  @IsEnum(PlanType)
  planType!: PlanType;

  @IsUrl({ require_tld: false })
  successUrl!: string;

  @IsUrl({ require_tld: false })
  cancelUrl!: string;
}
