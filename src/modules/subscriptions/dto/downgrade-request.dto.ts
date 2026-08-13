import { Transform } from 'class-transformer';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { trimString } from '../../../common/transformers/trim-string.transformer';

export class DowngradeRequestDto {
  // Free text — "Starter", "Pay-as-you-go", whichever card they clicked.
  // Not a PlanType enum on purpose: your Screen 4 tiers (Pay-as-you-go,
  // Limited plan) don't match the STARTER/GROWTH/ENTERPRISE catalog, so
  // this is exactly the kind of thing sales sorts out on the call rather
  // than something the system should try to validate.
  @Transform(trimString)
  @IsString()
  @MaxLength(80)
  requestedPlanName!: string;

  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(1000)
  note?: string;
}