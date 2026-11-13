import { Transform, Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import {
  PLATFORM_DATE_FORMATS,
  PLATFORM_TIME_FORMATS,
} from '../../../database/schemas/platform-setting.schema';
import { normalizeEmail } from '../../../common/transformers/normalize-email.transformer';
import { trimString } from '../../../common/transformers/trim-string.transformer';

const PHONE_PATTERN = /^\+?[1-9]\d{7,14}$/;
const CURRENCY_PATTERN = /^[A-Z]{3}$/;
const LANGUAGE_PATTERN = /^[a-z]{2}(?:-[A-Z]{2})?$/;

const emptyToNull = ({ value }: { value: unknown }) => {
  if (typeof value !== 'string') return value;
  const normalized = value.trim();
  return normalized === '' ? null : normalized;
};

export class UpdatePlatformSettingsDto {
  @ApiProperty({
    minimum: 0,
    example: 0,
    description: 'Revision returned by the latest GET /platform/settings.',
  })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  expectedRevision!: number;

  @ApiPropertyOptional({ example: 'Noltra AI' })
  @Transform(trimString)
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  platformName?: string;

  @ApiPropertyOptional({ example: 'https://app.noltra.ai' })
  @Transform(trimString)
  @IsOptional()
  @IsUrl({
    protocols: ['http', 'https'],
    require_protocol: true,
    require_valid_protocol: true,
  })
  @MaxLength(500)
  platformUrl?: string;

  @ApiPropertyOptional({ example: 'support@noltra.ai', nullable: true })
  @Transform(emptyToNull)
  @Transform(normalizeEmail)
  @IsOptional()
  @IsEmail()
  @MaxLength(254)
  supportEmail?: string | null;

  @ApiPropertyOptional({ example: '+15551234567', nullable: true })
  @Transform(({ value }: { value: unknown }) => {
    const normalized = emptyToNull({ value });
    return typeof normalized === 'string'
      ? normalized.replace(/[\s()-]/g, '')
      : normalized;
  })
  @IsOptional()
  @Matches(PHONE_PATTERN, {
    message: 'supportPhone must be a valid international phone number',
  })
  supportPhone?: string | null;

  @ApiPropertyOptional({ example: 'Asia/Dhaka' })
  @Transform(trimString)
  @IsOptional()
  @IsString()
  @MaxLength(80)
  timezone?: string;

  @ApiPropertyOptional({ example: 'en' })
  @Transform(trimString)
  @IsOptional()
  @Matches(LANGUAGE_PATTERN, {
    message: 'language must be a locale such as en or en-US',
  })
  language?: string;

  @ApiPropertyOptional({ example: 'USD' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsOptional()
  @Matches(CURRENCY_PATTERN, {
    message: 'defaultCurrency must be a three-letter ISO currency code',
  })
  defaultCurrency?: string;

  @ApiPropertyOptional({ enum: PLATFORM_DATE_FORMATS })
  @IsOptional()
  @IsEnum(PLATFORM_DATE_FORMATS)
  dateFormat?: (typeof PLATFORM_DATE_FORMATS)[number];

  @ApiPropertyOptional({ enum: PLATFORM_TIME_FORMATS })
  @IsOptional()
  @IsEnum(PLATFORM_TIME_FORMATS)
  timeFormat?: (typeof PLATFORM_TIME_FORMATS)[number];

  @ApiPropertyOptional({
    description:
      'Temporarily blocks customer-facing API traffic while preserving authentication, health checks, webhooks, and platform-admin recovery routes.',
  })
  @IsOptional()
  @IsBoolean()
  maintenanceMode?: boolean;
}
