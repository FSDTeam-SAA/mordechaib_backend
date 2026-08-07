import {
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  IsUrl,
} from 'class-validator';
import { PlanType } from '../../../common/enums/plan-type.enum';
import { SetupFeeType } from '../../../common/enums/setup-fee-type.enum';
import { SetupType } from '../../../common/enums/setup-type.enum';

export class CreateOnboardingSetupDto {
  @IsEnum(PlanType)
  packageType!: PlanType;

  @IsOptional()
  @IsEnum(SetupType)
  setupType?: SetupType;

  @IsOptional()
  @IsEnum(SetupFeeType)
  setupFeeType?: SetupFeeType;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  setupPackageName?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  setupPackagePrice?: number;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(10)
  setupPackageCurrency?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  setupPackageDescription?: string;

  @IsOptional()
  @IsUrl({ require_tld: false })
  paymentSuccessUrl?: string;

  @IsOptional()
  @IsUrl({ require_tld: false })
  paymentCancelUrl?: string;
}
