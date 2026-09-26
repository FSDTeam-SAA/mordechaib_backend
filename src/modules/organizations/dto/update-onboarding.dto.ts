import { Transform } from 'class-transformer';
import {
  IsBoolean,
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
const CURRENCY_PATTERN = /^[A-Z]{3}$/;
const DATE_FORMATS = ['MM/DD/YYYY', 'DD/MM/YYYY', 'YYYY-MM-DD'] as const;
const TIME_FORMATS = ['12H', '24H'] as const;

export class UpdateOnboardingDto {
  @Transform(trimString)
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  companyName?: string | null;

  @Transform(({ value }: { value: unknown }) => {
    if (typeof value !== 'string') return value;
    const website = value.trim();
    return website === '' ? undefined : website;
  })
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

  @Transform(({ value }: { value: unknown }) => {
    if (typeof value !== 'string') return value;
    const logoUrl = value.trim();
    return logoUrl === '' ? undefined : logoUrl;
  })
  @IsOptional()
  @IsUrl({ require_protocol: true })
  @MaxLength(500)
  logoUrl?: string | null;

  @Transform(({ value }: { value: unknown }) => {
    if (typeof value !== 'string') return value;
    const faviconUrl = value.trim();
    return faviconUrl === '' ? undefined : faviconUrl;
  })
  @IsOptional()
  @IsUrl({ require_protocol: true })
  @MaxLength(500)
  faviconUrl?: string | null;

  @Transform(({ value }: { value: unknown }) => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return value;
  })
  @IsOptional()
  @IsBoolean()
  maintenanceMode?: boolean;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsOptional()
  @Matches(CURRENCY_PATTERN, {
    message: 'defaultCurrency must be a three-letter ISO currency code',
  })
  defaultCurrency?: string | null;

  @IsOptional()
  @IsEnum(DATE_FORMATS)
  dateFormat?: (typeof DATE_FORMATS)[number] | null;

  @IsOptional()
  @IsEnum(TIME_FORMATS)
  timeFormat?: (typeof TIME_FORMATS)[number] | null;

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
