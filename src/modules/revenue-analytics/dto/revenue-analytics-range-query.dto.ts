import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsDate,
  IsMongoId,
  IsOptional,
  IsString,
  IsTimeZone,
  MaxLength,
} from 'class-validator';
import { trimString } from '../../../common/transformers/trim-string.transformer';

/**
 * Shared range/filter contract for the retention, unit-economics, cohort,
 * and report endpoints introduced in later phases.
 */
export class RevenueAnalyticsRangeQueryDto {
  @ApiProperty({
    format: 'date-time',
    description: 'Inclusive UTC start of the reporting period.',
  })
  @Type(() => Date)
  @IsDate()
  from!: Date;

  @ApiProperty({
    format: 'date-time',
    description: 'Exclusive UTC end of the reporting period.',
  })
  @Type(() => Date)
  @IsDate()
  to!: Date;

  @ApiProperty({ example: 'Asia/Dhaka' })
  @Transform(trimString)
  @IsTimeZone()
  timezone!: string;

  @ApiPropertyOptional({
    description: 'Limit the analytics result to one subscription plan.',
  })
  @IsOptional()
  @IsMongoId()
  planId?: string;

  @ApiPropertyOptional({
    description: 'Limit acquisition metrics to one normalized channel.',
    maxLength: 80,
  })
  @Transform(trimString)
  @IsOptional()
  @IsString()
  @MaxLength(80)
  channel?: string;
}
