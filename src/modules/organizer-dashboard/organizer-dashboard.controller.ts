import { Controller, Get, Header, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentOrg } from '../../common/decorators/current-org.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/enums/user-role.enum';
import { OrganizationGuard } from '../../common/guards/organization.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import {
  RequestOrganization,
  RequestUser,
} from '../../common/types/request-context.type';
import {
  DashboardListQueryDto,
  DashboardSummaryQueryDto,
  DashboardWorkforceQueryDto,
} from './dto/dashboard-list-query.dto';
import { OrganizerDashboardService } from './organizer-dashboard.service';

@ApiTags('Organizer Dashboard')
@ApiBearerAuth()
@Controller('organizer-dashboard')
@UseGuards(OrganizationGuard, RolesGuard)
@Roles(UserRole.OWNER, UserRole.ADMIN)
export class OrganizerDashboardController {
  constructor(private readonly dashboard: OrganizerDashboardService) {}

  @Get('summary')
  @Header('Cache-Control', 'private, max-age=30')
  @ApiOperation({ summary: 'Get organizer dashboard KPI cards and trends' })
  summary(
    @CurrentOrg() organization: RequestOrganization,
    @CurrentUser() user: RequestUser,
    @Query() query: DashboardSummaryQueryDto,
  ) {
    return this.dashboard.summary(organization.id, user.id, query);
  }

  @Get('workforce')
  @Header('Cache-Control', 'private, max-age=120')
  @ApiOperation({
    summary: 'Get the global AI workforce with organizer runtime activity',
  })
  workforce(
    @CurrentOrg() organization: RequestOrganization,
    @Query() query: DashboardWorkforceQueryDto,
  ) {
    return this.dashboard.workforce(organization.id, query);
  }

  @Get('upcoming-meetings')
  @Header('Cache-Control', 'private, max-age=15')
  @ApiOperation({ summary: 'Get deduplicated upcoming organizer meetings' })
  upcomingMeetings(
    @CurrentOrg() organization: RequestOrganization,
    @Query() query: DashboardListQueryDto,
  ) {
    return this.dashboard.upcomingMeetings(organization.id, query);
  }

  @Get('today-briefing')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: "Get the organizer's latest briefing for today" })
  todayBriefing(
    @CurrentOrg() organization: RequestOrganization,
    @CurrentUser() user: RequestUser,
  ) {
    return this.dashboard.todayBriefing(organization.id, user.id, user.role);
  }

  @Get('recent-voice-notes')
  @Header('Cache-Control', 'private, max-age=15')
  @ApiOperation({ summary: 'Get recent call intelligence voice-note cards' })
  recentVoiceNotes(
    @CurrentOrg() organization: RequestOrganization,
    @Query() query: DashboardListQueryDto,
  ) {
    return this.dashboard.recentVoiceNotes(organization.id, query);
  }

  @Get('task-overview')
  @Header('Cache-Control', 'private, max-age=15')
  @ApiOperation({ summary: 'Get mutually exclusive task overview counts' })
  taskOverview(@CurrentOrg() organization: RequestOrganization) {
    return this.dashboard.taskOverview(organization.id);
  }

  @Get('top-priorities')
  @Header('Cache-Control', 'private, max-age=15')
  @ApiOperation({ summary: 'Get ranked organizer task priorities' })
  topPriorities(
    @CurrentOrg() organization: RequestOrganization,
    @Query() query: DashboardListQueryDto,
  ) {
    return this.dashboard.topPriorities(organization.id, query);
  }
}
