import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  Min,
} from 'class-validator';

const TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/;
const TIMEZONE_OFFSET_PATTERN = /^(?:Z|[+-](?:0\d|1[0-4]):[0-5]\d)$/;

export class MetaDateFilterQueryDto {
  @ApiPropertyOptional({
    description:
      'A single calendar date. Cannot be combined with fromDate or toDate.',
    example: '2026-08-28',
  })
  @IsOptional()
  @IsDateString({ strict: true })
  @Length(10, 10)
  date?: string;

  @ApiPropertyOptional({
    description: 'Inclusive first date of a range. Requires toDate.',
    example: '2026-08-01',
  })
  @IsOptional()
  @IsDateString({ strict: true })
  @Length(10, 10)
  fromDate?: string;

  @ApiPropertyOptional({
    description: 'Inclusive last date of a range. Requires fromDate.',
    example: '2026-08-28',
  })
  @IsOptional()
  @IsDateString({ strict: true })
  @Length(10, 10)
  toDate?: string;

  @ApiPropertyOptional({
    description:
      'Inclusive start time applied to date/fromDate, in HH:mm or HH:mm:ss format.',
    example: '09:00',
  })
  @IsOptional()
  @Matches(TIME_PATTERN, {
    message: 'startTime must use HH:mm or HH:mm:ss format',
  })
  startTime?: string;

  @ApiPropertyOptional({
    description:
      'Inclusive end time applied to date/toDate, in HH:mm or HH:mm:ss format.',
    example: '17:30',
  })
  @IsOptional()
  @Matches(TIME_PATTERN, {
    message: 'endTime must use HH:mm or HH:mm:ss format',
  })
  endTime?: string;

  @ApiPropertyOptional({
    description:
      'UTC offset used to interpret date and time values. Encode + as %2B in URLs.',
    default: 'Z',
    example: '+06:00',
  })
  @IsOptional()
  @Matches(TIMEZONE_OFFSET_PATTERN, {
    message: 'timezoneOffset must be Z or an offset such as +06:00 or -05:00',
  })
  timezoneOffset?: string;
}

export class MetaListQueryDto extends MetaDateFilterQueryDto {
  @ApiPropertyOptional({ default: 25, minimum: 1, maximum: 100 })
  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 25;
}

export class MetaInsightsQueryDto extends MetaDateFilterQueryDto {
  @ApiPropertyOptional({
    description: 'Comma-separated Meta insight metric names.',
  })
  @IsOptional()
  @IsString()
  metrics?: string;

  @ApiPropertyOptional({ default: 'day', example: 'day' })
  @IsOptional()
  @IsString()
  period?: string;
}

export class MetaOverviewQueryDto extends MetaListQueryDto {
  @ApiPropertyOptional({
    description: 'Comma-separated Meta insight metric names.',
  })
  @IsOptional()
  @IsString()
  metrics?: string;

  @ApiPropertyOptional({ default: 'day', example: 'day' })
  @IsOptional()
  @IsString()
  period?: string;
}
