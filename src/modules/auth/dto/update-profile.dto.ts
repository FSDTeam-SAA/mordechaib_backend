import { Transform } from 'class-transformer';
import {
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { trimString } from '../../../common/transformers/trim-string.transformer';

const PHONE_PATTERN = /^\+?[1-9]\d{7,14}$/;
const LANGUAGE_PATTERN = /^[a-z]{2}(?:-[A-Z]{2})?$/;

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

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.replace(/[\s()-]/g, '') : value,
  )
  @Matches(PHONE_PATTERN, {
    message: 'phoneNumber must be a valid international number',
  })
  @IsOptional()
  phoneNumber?: string | null;

  @Transform(trimString)
  @IsString()
  @MaxLength(80)
  @IsOptional()
  timezone?: string | null;

  @Transform(trimString)
  @Matches(LANGUAGE_PATTERN, {
    message: 'language must be a locale such as en or en-US',
  })
  @IsOptional()
  language?: string | null;

  @Transform(trimString)
  @IsUrl({ require_protocol: true })
  @MaxLength(500)
  @IsOptional()
  avatarUrl?: string | null;
}
