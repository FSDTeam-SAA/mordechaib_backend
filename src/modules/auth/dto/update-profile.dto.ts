import { Transform } from 'class-transformer';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { trimString } from '../../../common/transformers/trim-string.transformer';

export class UpdateProfileDto {
  @Transform(trimString)
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  @IsOptional()
  firstName?: string;

  @Transform(trimString)
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  @IsOptional()
  lastName?: string;
}
