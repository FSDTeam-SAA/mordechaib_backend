import { Transform } from 'class-transformer';
import {
  IsISO8601,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Matches,
} from 'class-validator';

const ZOOM_MEETING_URL =
  /^https:\/\/(?:[a-z0-9-]+\.)?zoom\.us\/(?:j|my)\/[A-Za-z0-9._-]+(?:[/?#].*)?$/i;

const trimString = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class CreateZoomMeetingDto {
  @Transform(trimString)
  @IsString()
  @MaxLength(2048)
  @Matches(ZOOM_MEETING_URL, {
    message: 'meetingUrl must be a valid Zoom meeting URL',
  })
  meetingUrl!: string;

  @IsOptional()
  @IsISO8601({ strict: true })
  joinAt?: string;

  @Transform(trimString)
  @IsOptional()
  @IsString()
  @MaxLength(100)
  botName?: string;

  @Transform(trimString)
  @IsOptional()
  @IsString()
  @MaxLength(128)
  idempotencyKey?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
