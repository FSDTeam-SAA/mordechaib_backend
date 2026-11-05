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
import { UpdateCalendarEventDto } from './dto/update-calendar-event.dto';
import { SyncCalendarDto } from './dto/sync-calendar.dto';
import { CalendarDashboardQueryDto } from './dto/calendar-dashboard-query.dto';
import { CalendarDashboardService } from './calendar-dashboard.service';
import { CalendarService } from './calendar.service';
import { CalendarFollowUpsService } from './calendar-follow-ups.service';
import { ListMeetingFollowUpsQueryDto } from './dto/list-meeting-follow-ups-query.dto';
import { ResolveMeetingFollowUpDto } from './dto/resolve-meeting-follow-up.dto';
import { BackfillCalendarInsightsDto } from './dto/backfill-calendar-insights.dto';
import { MeetingAnalysisInsightsService } from '../source-analyses/meeting-analysis-insights.service';

@ApiTags('Calendar Integrations')
@ApiBearerAuth()
@Controller('calendar')
@UseGuards(OrganizationGuard)
export class CalendarController {
  constructor(
    private readonly calendarService: CalendarService,
    private readonly dashboard: CalendarDashboardService,
    private readonly followUps: CalendarFollowUpsService,
    private readonly meetingInsights: MeetingAnalysisInsightsService,
  ) {}

  @Post('insights/backfill')
  @UseGuards(RolesGuard)
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiOperation({
    summary: 'Idempotently backfill follow-up and customer-health insights',
  })
  backfillInsights(
    @CurrentOrg() org: { id: string },
    @Query() query: BackfillCalendarInsightsDto,
  ) {
    return this.meetingInsights.backfill(org.id, query.limit);
  }

  @Get('follow-ups')
  @ApiOperation({ summary: 'List persisted meeting follow-up signals' })
  listFollowUps(
    @CurrentOrg() org: { id: string },
    @Query() query: ListMeetingFollowUpsQueryDto,
  ) {
    return this.followUps.list(org.id, query);
  }

  @Patch('follow-ups/:id')
  @UseGuards(RolesGuard)
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Complete or dismiss a pending meeting follow-up' })
  resolveFollowUp(
    @CurrentOrg() org: { id: string },
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() dto: ResolveMeetingFollowUpDto,
  ) {
    return this.followUps.resolve(org.id, user.id, id, dto);
  }

  @Get('dashboard')
  @ApiOperation({
    summary: 'Get the unified calendar dashboard for an explicit date range',
    description:
      'Returns every platform-created meeting plus synchronized events from the organization default Google or Outlook calendar. Changing the default connection switches the synchronized-event source without hiding meetings created through another provider.',
  })
  dashboardView(
    @CurrentOrg() org: { id: string },
    @Query() query: CalendarDashboardQueryDto,
  ) {
    return this.dashboard.get(org.id, query);
  }

  @Post('events')
  @UseGuards(RolesGuard)
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiOperation({
    summary: 'Schedule a meeting or calendar event in the default calendar',
    description:
      'Meeting type is restricted to GOOGLE_MEET, ZOOM_MEET, AUDIO_CALL, or OTHER. Use POST /meetings when a provider-created Google Meet or Zoom link is required.',
  })
  createEvent(
    @CurrentOrg() org: { id: string },
    @CurrentUser() user: RequestUser,
    @Body() dto: CreateCalendarEventDto,
  ) {
    return this.calendarService.createEvent(org.id, user.id, dto);
  }

  @Post('sync')
  @UseGuards(RolesGuard)
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiOperation({
    summary: 'Synchronize connected Google and Outlook calendar events',
  })
  syncEvents(
    @CurrentOrg() org: { id: string },
    @CurrentUser() user: RequestUser,
    @Body() dto: SyncCalendarDto,
  ) {
    return this.calendarService.syncEvents(org.id, user.id, dto);
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
