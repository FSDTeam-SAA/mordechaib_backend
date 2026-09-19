import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentOrg } from '../../common/decorators/current-org.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/enums/user-role.enum';
import { OrganizationGuard } from '../../common/guards/organization.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CalendarService } from './calendar.service';
import { SetDefaultCalendarDto } from './dto/set-default-calendar.dto';

@ApiTags('Connections')
@ApiBearerAuth()
@Controller('calendar')
@UseGuards(OrganizationGuard)
export class CalendarConnectionsController {
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
}
