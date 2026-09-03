import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { CalendarProviderType } from '../../../common/enums/calendar-provider.enum';

export class SetDefaultCalendarDto {
  @ApiProperty({ enum: CalendarProviderType })
  @IsEnum(CalendarProviderType)
  provider!: CalendarProviderType;
}
