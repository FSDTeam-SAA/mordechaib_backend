import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, Matches, MaxLength } from 'class-validator';
import { normalizeEmail } from '../../../common/transformers/normalize-email.transformer';

export class VerifyPasswordResetOtpDto {
  @ApiProperty({ example: 'owner@example.com' })
  @Transform(normalizeEmail)
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @ApiProperty({ example: '123456', minLength: 6, maxLength: 6 })
  @Matches(/^\d{6}$/, { message: 'code must contain exactly 6 digits' })
  code!: string;
}
