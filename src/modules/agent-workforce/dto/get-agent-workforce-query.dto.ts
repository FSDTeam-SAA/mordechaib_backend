import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsISO8601, IsInt, IsOptional, Max, Min } from 'class-validator';

export class GetAgentWorkforceQueryDto {
  @ApiPropertyOptional({
    format: 'date-time',
    description: 'Analytics range start. Defaults to 24 hours before `to`.',
  })
  @IsOptional()
  @IsISO8601({ strict: true })
  from?: string;

  @ApiPropertyOptional({
    format: 'date-time',
    description: 'Analytics range end. Defaults to now.',
  })
  @IsOptional()
  @IsISO8601({ strict: true })
  to?: string;

  @ApiPropertyOptional({ type: Number, default: 1, minimum: 1 })
  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  page = 1;

  @ApiPropertyOptional({ type: Number, default: 20, minimum: 1, maximum: 100 })
  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;

  @ApiPropertyOptional({
    type: Number,
    default: 60,
    minimum: 5,
    maximum: 1440,
    description:
      'A STARTED activity older than this is reported as stale, not running.',
  })
  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(5)
  @Max(1440)
  runningFreshnessMinutes = 60;
}
