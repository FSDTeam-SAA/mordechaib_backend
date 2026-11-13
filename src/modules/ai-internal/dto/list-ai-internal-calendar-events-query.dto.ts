import { ApiProperty } from '@nestjs/swagger';
import { IsMongoId } from 'class-validator';
import { ListCalendarEventsQueryDto } from '../../calendar/dto/list-calendar-events-query.dto';

export class ListAiInternalCalendarEventsQueryDto extends ListCalendarEventsQueryDto {
  @ApiProperty({ type: String })
  @IsMongoId()
  requesterUserId!: string;
}
