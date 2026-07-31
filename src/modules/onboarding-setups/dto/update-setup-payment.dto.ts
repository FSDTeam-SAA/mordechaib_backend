import { IsEnum, IsNotEmpty, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { SetupPaymentStatus } from '../../../common/enums/setup-payment-status.enum';

export class UpdateSetupPaymentDto {
  @IsEnum(SetupPaymentStatus)
  status!: SetupPaymentStatus;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  provider?: string;

  @IsOptional()
  @IsString()
  paymentIntentId?: string;

  @IsOptional()
  @IsString()
  checkoutSessionId?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  amount?: number;
}