import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEmail,
  IsEnum,
  IsISO8601,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { MeetingPlatform } from '../../../common/enums/meeting-platform.enum';

const trimString = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

const normalizeInvitees = ({ value }: { value: unknown }) =>
  Array.isArray(value)
    ? value.map((email) =>
        typeof email === 'string' ? email.trim().toLowerCase() : email,
      )
    : value;

export class CreateConnectedMeetingDto {
  @ApiProperty({ enum: MeetingPlatform, example: MeetingPlatform.GOOGLE_MEET })
  @IsEnum(MeetingPlatform)
  platform!: MeetingPlatform;

  @ApiProperty({ example: 'Weekly project review', maxLength: 200 })
  @Transform(trimString)
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string;

  @ApiPropertyOptional({ example: 'Review progress and agree next steps' })
  @Transform(trimString)
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  agenda?: string;

  @ApiPropertyOptional({
    description: 'Omit to start an instant meeting',
    example: '2026-09-01T10:00:00.000Z',
  })
  @IsOptional()
  @IsISO8601({ strict: true })
  startsAt?: string;

  @ApiPropertyOptional({ default: 30, minimum: 1, maximum: 1440 })
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

  @ApiPropertyOptional({
    type: [String],
    example: ['guest@example.com'],
    maxItems: 100,
  })
  @Transform(normalizeInvitees)
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ArrayUnique()
  @IsEmail({}, { each: true })
  invitees?: string[];

  @ApiPropertyOptional({ default: 15, minimum: 0, maximum: 40320 })
  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(40320)
  reminderMinutesBeforeStart?: number;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  sendBot?: boolean = true;

  @ApiPropertyOptional({ example: 'Noltra AI Notetaker', maxLength: 100 })
  @Transform(trimString)
  @IsOptional()
  @IsString()
  @MaxLength(100)
  botName?: string;

  @ApiPropertyOptional({
    description: 'Reuse this value when retrying the same create request',
    example: 'frontend-request-01J7Y6A',
    maxLength: 128,
  })
  @Transform(trimString)
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  idempotencyKey?: string;

  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
