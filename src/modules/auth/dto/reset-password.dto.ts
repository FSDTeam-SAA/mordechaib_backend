import { IsString, Matches, MaxLength, MinLength } from 'class-validator';
import {
  PASSWORD_MESSAGE,
  PASSWORD_PATTERN,
} from './password-validation.constants';

export class ResetPasswordDto {
  @IsString()
  @MinLength(6)
  @MaxLength(6)
  @Matches(/^\d{6}$/, { message: 'code must be a 6-digit number' })
  code!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(72)
  @Matches(PASSWORD_PATTERN, { message: PASSWORD_MESSAGE })
  newPassword!: string;
}
