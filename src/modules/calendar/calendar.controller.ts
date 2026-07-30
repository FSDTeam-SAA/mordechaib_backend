import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { CurrentOrg } from '../../common/decorators/current-org.decorator';
import { OrganizationGuard } from '../../common/guards/organization.guard';
import { CreateCalendarEventDto } from './dto/create-calendar-event.dto';
import { CalendarService } from './calendar.service';

@Controller('calendar')
@UseGuards(OrganizationGuard)
export class CalendarController {
  constructor(private readonly calendarService: CalendarService) {}

  @Post('events')
  createEvent(
    @CurrentOrg() org: { id: string },
    @Body() dto: CreateCalendarEventDto,
  ) {
    return this.calendarService.createEvent(org.id, dto);
  }
}
