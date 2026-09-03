import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
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

const trimString = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

const normalizeInvitees = ({ value }: { value: unknown }) =>
  Array.isArray(value)
    ? value.map((email) =>
        typeof email === 'string' ? email.trim().toLowerCase() : email,
      )
    : value;

export class UpdateConnectedMeetingDto {
  @ApiPropertyOptional({ maxLength: 200 })
  @Transform(trimString)
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title?: string;

  @ApiPropertyOptional({ maxLength: 2000 })
  @Transform(trimString)
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  agenda?: string;

  @ApiPropertyOptional({ example: '2026-09-01T10:00:00.000Z' })
  @IsOptional()
  @IsISO8601({ strict: true })
  startsAt?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 1440 })
  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1440)
  durationMinutes?: number;

  @ApiPropertyOptional({ example: 'Asia/Dhaka' })
  @Transform(trimString)
  @IsOptional()
  @IsString()
  @MaxLength(100)
  timezone?: string;

  @ApiPropertyOptional({ type: [String], maxItems: 100 })
  @Transform(normalizeInvitees)
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ArrayUnique()
  @IsEmail({}, { each: true })
  invitees?: string[];

  @ApiPropertyOptional({ minimum: 0, maximum: 40320 })
  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(40320)
  reminderMinutesBeforeStart?: number;
}
