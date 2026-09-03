import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentOrg } from '../../common/decorators/current-org.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/enums/user-role.enum';
import { OrganizationGuard } from '../../common/guards/organization.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { RequestUser } from '../../common/types/request-context.type';
import { CreateCalendarEventDto } from './dto/create-calendar-event.dto';
import { ListCalendarEventsQueryDto } from './dto/list-calendar-events-query.dto';
import { SetDefaultCalendarDto } from './dto/set-default-calendar.dto';
import { UpdateCalendarEventDto } from './dto/update-calendar-event.dto';
import { CalendarService } from './calendar.service';

@ApiTags('Calendar Integrations')
@ApiBearerAuth()
@Controller('calendar')
@UseGuards(OrganizationGuard)
export class CalendarController {
  constructor(private readonly calendarService: CalendarService) {}

  @Get('connections')
  @ApiOperation({ summary: 'List Google and Outlook calendar connections' })
  connections(@CurrentOrg() org: { id: string }) {
    return this.calendarService.listConnections(org.id);
  }

  @Patch('default')
  @UseGuards(RolesGuard)
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Select the organization default calendar' })
  setDefault(
    @CurrentOrg() org: { id: string },
    @Body() dto: SetDefaultCalendarDto,
  ) {
    return this.calendarService.setDefault(org.id, dto.provider);
  }

  @Post('events')
  @UseGuards(RolesGuard)
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiOperation({
    summary: 'Create and locally track an event in the default calendar',
  })
  createEvent(
    @CurrentOrg() org: { id: string },
    @CurrentUser() user: RequestUser,
    @Body() dto: CreateCalendarEventDto,
  ) {
    return this.calendarService.createEvent(org.id, user.id, dto);
  }

  @Get('events')
  @ApiOperation({ summary: 'List platform-managed calendar events' })
  listEvents(
    @CurrentOrg() org: { id: string },
    @Query() query: ListCalendarEventsQueryDto,
  ) {
    return this.calendarService.listEvents(org.id, query);
  }

  @Get('events/:id')
  @ApiOperation({ summary: 'Get a platform-managed calendar event' })
  getEvent(@CurrentOrg() org: { id: string }, @Param('id') id: string) {
    return this.calendarService.getEvent(org.id, id);
  }

  @Patch('events/:id')
  @UseGuards(RolesGuard)
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Update a platform-managed calendar event' })
  updateEvent(
    @CurrentOrg() org: { id: string },
    @Param('id') id: string,
    @Body() dto: UpdateCalendarEventDto,
  ) {
    return this.calendarService.updateEvent(org.id, id, dto);
  }

  @Delete('events/:id')
  @UseGuards(RolesGuard)
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Cancel a platform-managed calendar event' })
  cancelEvent(@CurrentOrg() org: { id: string }, @Param('id') id: string) {
    return this.calendarService.cancelEvent(org.id, id);
  }
}
