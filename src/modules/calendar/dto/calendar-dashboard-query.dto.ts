import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsISO8601,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CalendarDashboardQueryDto {
  @ApiProperty({ type: String, example: '2026-09-01T00:00:00.000Z' })
  @IsISO8601({ strict: true })
  from!: string;

  @ApiProperty({ type: String, example: '2026-10-01T00:00:00.000Z' })
  @IsISO8601({ strict: true })
  to!: string;

  @ApiPropertyOptional({
    type: String,
    default: 'UTC',
    example: 'Asia/Dhaka',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  timezone = 'UTC';

  @ApiPropertyOptional({
    type: Number,
    default: 15,
    minimum: 0,
    maximum: 240,
  })
  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(240)
  bufferMinutes = 15;

  @ApiPropertyOptional({
    type: Number,
    default: 8,
    minimum: 1,
    maximum: 50,
  })
  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50)
  upcomingLimit = 8;

  @ApiPropertyOptional({
    type: Number,
    default: 20,
    minimum: 1,
    maximum: 100,
  })
  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  conflictLimit = 20;
}
