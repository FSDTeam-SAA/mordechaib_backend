import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { PlatformAdminGuard } from '../../common/guards/platform-admin.guard';
import { AdminMeetingCalendarService } from './admin-meeting-calendar.service';
import { AdminMeetingCalendarResponse } from './admin-meeting-calendar.types';
import { AdminMeetingCalendarQueryDto } from './dto/admin-meeting-calendar-query.dto';

@ApiTags('Meeting Calendar (platform admin)')
@ApiBearerAuth()
@Controller('platform/meeting-calendar')
@UseGuards(PlatformAdminGuard)
export class AdminMeetingCalendarController {
  constructor(private readonly calendar: AdminMeetingCalendarService) {}

  @Get()
  @ApiOperation({
    summary: 'Get the cross-organization platform meeting calendar',
    description:
      'Returns deduplicated platform meetings and synchronized calendar events, stable summary cards, meeting-type breakdown, upcoming meetings, and a filtered paginated list.',
  })
  @ApiOkResponse({ type: AdminMeetingCalendarResponse })
  dashboard(@Query() query: AdminMeetingCalendarQueryDto) {
    return this.calendar.dashboard(query);
  }
}
