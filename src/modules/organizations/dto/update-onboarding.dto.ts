import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  MaxLength,
} from 'class-validator';
import { BusinessIndustry } from '../../../common/enums/business-industry.enum';
import { BusinessSize } from '../../../common/enums/business-size.enum';
import { normalizeEmail } from '../../../common/transformers/normalize-email.transformer';
import { trimString } from '../../../common/transformers/trim-string.transformer';

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
const PHONE_PATTERN = /^\+?[1-9]\d{7,14}$/;

export class UpdateOnboardingDto {
  @Transform(trimString)
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  companyName?: string | null;

  @Transform(trimString)
  @IsOptional()
  @IsUrl({ require_protocol: true })
  @MaxLength(500)
  website?: string | null;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.replace(/[\s()-]/g, '') : value,
  )
  @IsOptional()
  @Matches(PHONE_PATTERN, {
    message: 'phoneNumber must be a valid international number',
  })
  phoneNumber?: string | null;

  @Transform(normalizeEmail)
  @IsOptional()
  @IsEmail()
  emailAddress?: string | null;

  @Transform(trimString)
  @IsOptional()
  @IsString()
  @MaxLength(80)
  timezone?: string | null;

  @Transform(trimString)
  @IsOptional()
  @Matches(/^[a-z]{2}(?:-[A-Z]{2})?$/, {
    message: 'language must be a locale such as en or en-US',
  })
  language?: string | null;

  @Transform(trimString)
  @IsOptional()
  @IsUrl({ require_protocol: true })
  @MaxLength(500)
  logoUrl?: string | null;

  @IsOptional()
  @Matches(TIME_PATTERN, {
    message: 'businessHoursStart must use HH:mm format',
  })
  businessHoursStart?: string | null;

  @IsOptional()
  @Matches(TIME_PATTERN, { message: 'businessHoursEnd must use HH:mm format' })
  businessHoursEnd?: string | null;

  @Transform(trimString)
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  city?: string | null;

  @Transform(trimString)
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  street?: string | null;

  @Transform(trimString)
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  state?: string | null;

  @Transform(trimString)
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  postalCode?: string | null;

  @IsOptional()
  @IsEnum(BusinessIndustry)
  industry?: BusinessIndustry | null;

  @IsOptional()
  @IsEnum(BusinessSize)
  businessSize?: BusinessSize | null;
}
