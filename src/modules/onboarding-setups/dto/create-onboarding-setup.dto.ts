import { IsMongoId, IsOptional, IsUrl } from 'class-validator';

export class CreateOnboardingSetupDto {
  // The frontend selects an active package from GET /setup-packages. The
  // server reads all commercial settings from that catalog record.
  @IsMongoId()
  setupPackageId!: string;

  @IsOptional()
  @IsUrl({ require_tld: false })
  paymentSuccessUrl?: string;

  @IsOptional()
  @IsUrl({ require_tld: false })
  paymentCancelUrl?: string;
}
