import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches, MaxLength, MinLength } from 'class-validator';
import {
  PASSWORD_MESSAGE,
  PASSWORD_PATTERN,
} from './password-validation.constants';

export class ResetPasswordDto {
  @ApiProperty({ example: 'NewPassword1!' })
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  @Matches(PASSWORD_PATTERN, { message: PASSWORD_MESSAGE })
  newPassword!: string;
}
