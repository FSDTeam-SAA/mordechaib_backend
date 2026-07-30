import { IsArray, IsISO8601, IsOptional, IsString } from 'class-validator';

export class CreateCalendarEventDto {
  @IsString()
  title!: string;

  @IsISO8601()
  startTime!: string;

  @IsISO8601()
  endTime!: string;

  @IsArray()
  @IsOptional()
  attendees?: string[];
}
