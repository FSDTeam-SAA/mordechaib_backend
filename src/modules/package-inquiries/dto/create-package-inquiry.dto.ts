import { Transform } from 'class-transformer';
import {
  Equals,
  IsEmail,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { normalizeEmail } from '../../../common/transformers/normalize-email.transformer';
import { trimString } from '../../../common/transformers/trim-string.transformer';

export class CreatePackageInquiryDto {
  @Transform(trimString)
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  fullName!: string;

  @Transform(normalizeEmail)
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @Transform(trimString)
  @IsString()
  @MinLength(10)
  @MaxLength(2000)
  message!: string;

  @Equals(true, { message: 'acceptContactConsent must be true' })
  acceptContactConsent!: boolean;
}
