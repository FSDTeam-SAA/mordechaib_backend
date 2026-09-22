import { Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Min,
  ValidateNested,
} from 'class-validator';
import { PlanType } from '../../../common/enums/plan-type.enum';

export class AddonSelectionDto {
  // The _id of the AddonProduct document
  @IsString()
  addonProductId!: string;

  // Zero-based index into the product's tiers array
  @IsInt()
  @Min(0)
  tierIndex!: number;
}

// Accepts either planId or planType, plus an optional list of add-ons
// to include as line items in the same Stripe Checkout Session.
// If addons is omitted or empty, it checks out only the base subscription plan.
export class CreateCheckoutSessionWithAddonsDto {
  @IsOptional()
  @IsEnum(PlanType)
  planType?: PlanType;

  // The _id of the SubscriptionPlan document (optional alternative to planType)
  @IsOptional()
  @IsString()
  planId?: string;

  @IsUrl({ require_tld: false })
  successUrl!: string;

  @IsUrl({ require_tld: false })
  cancelUrl!: string;

  // Optional: list of selected add-on tiers
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AddonSelectionDto)
  addons?: AddonSelectionDto[];
}
