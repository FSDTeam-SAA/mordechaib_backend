import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  Equals,
  IsEmail,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import { normalizeEmail } from '../../../common/transformers/normalize-email.transformer';
import { trimString } from '../../../common/transformers/trim-string.transformer';

export class CreateContactEnquiryDto {
  @Transform(trimString)
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  fullName!: string;

  @Transform(normalizeEmail)
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(200)
  company?: string;

  @ApiPropertyOptional({ maxLength: 160 })
  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(160)
  role?: string;

  @ApiProperty({ minLength: 10, maxLength: 5000 })
  @Transform(trimString)
  @IsString()
  @MinLength(10)
  @MaxLength(5000)
  message!: string;

  @Equals(true, { message: 'acceptContactConsent must be true' })
  acceptContactConsent!: boolean;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  clientRequestId?: string;
}
