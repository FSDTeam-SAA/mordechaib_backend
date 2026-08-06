import { Transform } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { PlanType } from '../../../common/enums/plan-type.enum';
import { SubscriptionStatus } from '../../../common/enums/subscription-status.enum';
import { trimString } from '../../../common/transformers/trim-string.transformer';

export class ListSubscriptionsQueryDto {
  // Matches the "Search organizations..." box — matches by org name.
  @IsOptional()
  @Transform(trimString)
  @IsString()
  search?: string;

  // Matches the "All Plans" dropdown.
  @IsOptional()
  @IsEnum(PlanType)
  planType?: PlanType;

  // Matches the "All Status" dropdown.
  @IsOptional()
  @IsEnum(SubscriptionStatus)
  status?: SubscriptionStatus;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 9;
}