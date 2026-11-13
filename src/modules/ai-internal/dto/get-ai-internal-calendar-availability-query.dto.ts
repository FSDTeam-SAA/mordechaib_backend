import { ApiProperty } from '@nestjs/swagger';
import { IsMongoId } from 'class-validator';
import { CalendarDashboardQueryDto } from '../../calendar/dto/calendar-dashboard-query.dto';

export class GetAiInternalCalendarAvailabilityQueryDto extends CalendarDashboardQueryDto {
  @ApiProperty({ type: String })
  @IsMongoId()
  requesterUserId!: string;
}
