import {
  ArrayNotEmpty,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

const LOCAL_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const LOCAL_TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

export class UpsertOnboardingAvailabilityDto {
  @ApiProperty({ example: 'Asia/Dhaka' })
  @IsString()
  @MaxLength(50)
  timezone!: string;

  @ApiProperty({ example: '2026-10-01' })
  @IsString()
  @Matches(LOCAL_DATE_PATTERN, {
    message: 'startDate must use YYYY-MM-DD format',
  })
  startDate!: string;

  @ApiPropertyOptional({
    example: '2026-10-05',
    nullable: true,
    description: 'Omit or send null to keep the schedule recurring indefinitely.',
  })
  @IsOptional()
  @ValidateIf((_object, value) => value !== null)
  @IsString()
  @Matches(LOCAL_DATE_PATTERN, {
    message: 'endDate must use YYYY-MM-DD format',
  })
  endDate?: string | null;

  @ApiProperty({
    example: [0, 1, 2, 3, 4, 5, 6],
    description: 'Available weekdays where 0 is Sunday and 6 is Saturday.',
  })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayUnique()
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(6, { each: true })
  weekdays!: number[];

  @ApiProperty({ example: '09:00' })
  @IsString()
  @Matches(LOCAL_TIME_PATTERN, {
    message: 'dailyStartTime must use HH:mm format',
  })
  dailyStartTime!: string;

  @ApiProperty({ example: '22:00' })
  @IsString()
  @Matches(LOCAL_TIME_PATTERN, {
    message: 'dailyEndTime must use HH:mm format',
  })
  dailyEndTime!: string;

  @ApiProperty({ example: 90 })
  @IsInt()
  @Min(15)
  @Max(480)
  meetingDurationMinutes!: number;

  @ApiPropertyOptional({ example: 0, default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(120)
  bufferMinutes?: number;

  @ApiPropertyOptional({ example: ['2026-10-03'] })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @Matches(LOCAL_DATE_PATTERN, {
    each: true,
    message: 'each blocked date must use YYYY-MM-DD format',
  })
  blockedDates?: string[];

  @ApiPropertyOptional({ example: true, default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
