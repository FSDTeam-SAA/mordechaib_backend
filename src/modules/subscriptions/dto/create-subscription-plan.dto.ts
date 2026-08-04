import { Transform } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { PlanType } from '../../../common/enums/plan-type.enum';
import { trimString } from '../../../common/transformers/trim-string.transformer';

export class CreateSubscriptionPlanDto {
  @IsEnum(PlanType)
  planType!: PlanType;

  @Transform(trimString)
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name!: string;

  @Transform(trimString)
  @IsOptional()
  @IsString()
  @MaxLength(160)
  tagline?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  priceUsd?: number;

  @IsOptional()
  @IsBoolean()
  isInquiryOnly?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  aiActionsPerMonth?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  crmContactsLimit?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  callMinutesPerMonth?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  usersIncluded?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  aiAgentsIncluded?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  trialDays?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  extraAiActionPriceUsd?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  extraCallMinutePriceUsd?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  features?: string[];

  @IsOptional()
  @IsBoolean()
  isMostPopular?: boolean;

  @IsOptional()
  @IsBoolean()
  customizationIncluded?: boolean;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsInt()
  sortOrder?: number;

  @IsOptional()
  @IsString()
  stripePriceId?: string;
}
