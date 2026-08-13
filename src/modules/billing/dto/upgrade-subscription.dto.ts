import { IsEnum } from 'class-validator';
import { PlanType } from '../../../common/enums/plan-type.enum';

export class UpgradeSubscriptionDto {
  @IsEnum(PlanType)
  planType!: PlanType;
}