import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsISO8601, IsOptional } from 'class-validator';
import { CalendarProviderType } from '../../../common/enums/calendar-provider.enum';

export class SyncCalendarDto {
  @ApiPropertyOptional({
    enum: CalendarProviderType,
    description: 'Omit to synchronize every connected calendar provider.',
  })
  @IsOptional()
  @IsEnum(CalendarProviderType)
  provider?: CalendarProviderType;

  @ApiPropertyOptional({ example: '2026-08-01T00:00:00.000Z' })
  @IsOptional()
  @IsISO8601({ strict: true })
  from?: string;

  @ApiPropertyOptional({ example: '2027-09-01T00:00:00.000Z' })
  @IsOptional()
  @IsISO8601({ strict: true })
  to?: string;
}
