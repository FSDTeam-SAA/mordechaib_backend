import { IsUrl } from 'class-validator';

export class CreateOnboardingPaymentSessionDto {
  @IsUrl({ require_tld: false })
  successUrl!: string;

  @IsUrl({ require_tld: false })
  cancelUrl!: string;
}
