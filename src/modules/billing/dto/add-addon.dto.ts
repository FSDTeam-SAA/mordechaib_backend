import { IsInt, IsString, Min } from 'class-validator';

// Used by POST /billing/addons — add or replace one add-on tier on an
// existing Stripe subscription. One add-on per category; submitting the
// same category a second time replaces the current tier.
export class AddAddonDto {
  @IsString()
  addonProductId!: string;

  @IsInt()
  @Min(0)
  tierIndex!: number;
}
