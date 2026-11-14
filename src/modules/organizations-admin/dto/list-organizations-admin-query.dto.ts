import { Transform } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsTimeZone,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { OrganizationStatus } from '../../../common/enums/organization-status.enum';
import { PlanType } from '../../../common/enums/plan-type.enum';
import { SubscriptionStatus } from '../../../common/enums/subscription-status.enum';
import { trimString } from '../../../common/transformers/trim-string.transformer';
import { AdminSubscriptionDisplayStatus } from '../admin-organization-contract';

export class ListOrganizationsAdminQueryDto {
  @ApiPropertyOptional({
    description:
      'Case-insensitive organization name, organization email/phone, or owner name/email/phone search.',
    maxLength: 120,
  })
  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(120)
  search?: string;

  @ApiPropertyOptional({ enum: OrganizationStatus })
  @IsOptional()
  @IsEnum(OrganizationStatus)
  status?: OrganizationStatus;

  @ApiPropertyOptional({ enum: PlanType })
  @IsOptional()
  @IsEnum(PlanType)
  planType?: PlanType;

  @ApiPropertyOptional({
    enum: SubscriptionStatus,
    description:
      'Raw provider subscription status. Do not combine with subscriptionDisplayStatus.',
  })
  @IsOptional()
  @IsEnum(SubscriptionStatus)
  subscriptionStatus?: SubscriptionStatus;

  @ApiPropertyOptional({
    enum: AdminSubscriptionDisplayStatus,
    description:
      'UI-effective subscription state. PAUSED is derived from a future pausedUntil timestamp.',
  })
  @IsOptional()
  @IsEnum(AdminSubscriptionDisplayStatus)
  subscriptionDisplayStatus?: AdminSubscriptionDisplayStatus;

  @ApiPropertyOptional({ enum: ['month', 'year'] })
  @IsOptional()
  @IsIn(['month', 'year'])
  billingInterval?: 'month' | 'year';

  @ApiPropertyOptional({
    default: 'UTC',
    description: 'IANA timezone used for the suspended-today summary metric.',
  })
  @IsOptional()
  @Transform(trimString)
  @IsTimeZone()
  timezone = 'UTC';

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}
