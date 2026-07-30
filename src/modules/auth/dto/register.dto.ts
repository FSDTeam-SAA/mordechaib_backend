import { Transform } from 'class-transformer';
import {
  Equals,
  IsBoolean,
  IsEmail,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { normalizeEmail } from '../../../common/transformers/normalize-email.transformer';
import { trimString } from '../../../common/transformers/trim-string.transformer';
import {
  PASSWORD_MESSAGE,
  PASSWORD_PATTERN,
} from './password-validation.constants';

export class RegisterDto {
  @Transform(trimString)
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  firstName!: string;

  @Transform(trimString)
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  lastName!: string;

  @Transform(normalizeEmail)
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(72)
  @Matches(PASSWORD_PATTERN, { message: PASSWORD_MESSAGE })
  password!: string;

  @Equals(true, { message: 'acceptTerms must be true' })
  acceptTerms!: boolean;

  @IsBoolean()
  @IsOptional()
  rememberMe = false;
}
