import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsEmail,
  IsISO8601,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateCalendarEventDto {
  @ApiProperty({ example: 'Quarterly planning', maxLength: 200 })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string;

  @ApiPropertyOptional({ example: 'Review goals and agree next actions' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiProperty({ example: '2026-09-10T10:00:00.000Z' })
  @IsISO8601({ strict: true })
  startTime!: string;

  @ApiProperty({ example: '2026-09-10T10:30:00.000Z' })
  @IsISO8601({ strict: true })
  endTime!: string;

  @ApiPropertyOptional({
    type: [String],
    example: ['guest@example.com'],
    maxItems: 100,
  })
  @IsArray()
  @IsOptional()
  @ArrayMaxSize(100)
  @ArrayUnique()
  @IsEmail({}, { each: true })
  attendees?: string[];

  @ApiPropertyOptional({ example: 'Asia/Dhaka' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  timezone?: string;

  @ApiPropertyOptional({ default: 15, minimum: 0, maximum: 40320 })
  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(40320)
  reminderMinutesBeforeStart?: number;

  @ApiPropertyOptional({
    description: 'Reuse this value when retrying the same create request',
    example: 'calendar-event-01J7Y6A',
    maxLength: 128,
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  idempotencyKey?: string;
}
