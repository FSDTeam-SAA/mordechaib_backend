import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsISO8601, IsOptional, IsString, MaxLength } from 'class-validator';

const trimString = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class UpdateMeetingBotDto {
  @ApiPropertyOptional({ example: 'https://meet.google.com/abc-defg-hij' })
  @Transform(trimString)
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  meetingUrl?: string;

  @ApiPropertyOptional({ example: '2026-08-28T10:00:00.000Z' })
  @IsOptional()
  @IsISO8601({ strict: true })
  joinAt?: string;

  @ApiPropertyOptional({ maxLength: 100 })
  @Transform(trimString)
  @IsOptional()
  @IsString()
  @MaxLength(100)
  botName?: string;
}
