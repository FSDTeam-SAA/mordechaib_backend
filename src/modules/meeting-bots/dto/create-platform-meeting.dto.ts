import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsISO8601,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

const trimString = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class CreatePlatformMeetingDto {
  @ApiProperty({ example: 'https://meet.google.com/abc-defg-hij' })
  @Transform(trimString)
  @IsString()
  @MaxLength(2048)
  meetingUrl!: string;

  @ApiPropertyOptional({ example: '2026-08-28T10:00:00.000Z' })
  @IsOptional()
  @IsISO8601({ strict: true })
  joinAt?: string;

  @ApiPropertyOptional({ example: 'Noltra AI Notetaker', maxLength: 100 })
  @Transform(trimString)
  @IsOptional()
  @IsString()
  @MaxLength(100)
  botName?: string;

  @ApiPropertyOptional({ example: 'calendar-event-or-request-id' })
  @Transform(trimString)
  @IsOptional()
  @IsString()
  @MaxLength(128)
  idempotencyKey?: string;

  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
