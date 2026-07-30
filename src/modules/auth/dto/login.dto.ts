import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { normalizeEmail } from '../../../common/transformers/normalize-email.transformer';

export class LoginDto {
  @Transform(normalizeEmail)
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @IsString()
  @MaxLength(72)
  password!: string;

  @IsBoolean()
  @IsOptional()
  rememberMe = false;
}
