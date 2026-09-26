import { IsIn, IsMongoId } from 'class-validator';

export class ChangeOrganizationPlanDto {
  @IsMongoId()
  planId!: string;

  @IsIn(['month', 'year'])
  billingInterval!: 'month' | 'year';
}
