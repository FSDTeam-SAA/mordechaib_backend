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
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiPropertyOptional,
  ApiTags,
} from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';
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
import { CreateConnectedMeetingDto } from './dto/create-connected-meeting.dto';
import { ListPlatformMeetingsQueryDto } from './dto/list-platform-meetings-query.dto';
import { PlatformMeetingsService } from './platform-meetings.service';
import { UpdateConnectedMeetingDto } from './dto/update-connected-meeting.dto';

class ProvisionMeetingBotDto {
  @ApiPropertyOptional({ example: 'Noltra AI Notetaker', maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  botName?: string;
}

@ApiTags('Connected Meetings')
@ApiBearerAuth()
@Controller('meetings')
@UseGuards(OrganizationGuard)
export class PlatformMeetingsController {
  constructor(private readonly meetings: PlatformMeetingsService) {}

  @Post()
  @UseGuards(RolesGuard)
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiOperation({
    summary:
      'Create a Zoom or Google Meet using the connected organizer account',
    description:
      'The backend creates the provider meeting and obtains its join URL. Do not provide meetingUrl for this endpoint.',
  })
  @ApiBody({
    type: CreateConnectedMeetingDto,
    description:
      'Provider meeting details. Only platform and title are required; omit startsAt for an instant meeting.',
  })
  create(
    @CurrentOrg() organization: RequestOrganization,
    @CurrentUser() user: RequestUser,
    @Body() input: CreateConnectedMeetingDto,
  ) {
    return this.meetings.create(organization.id, user.id, input);
  }

  @Get()
  @ApiOperation({ summary: 'List organization-created meetings' })
  list(
    @CurrentOrg() organization: RequestOrganization,
    @CurrentUser() user: RequestUser,
    @Query() query: ListPlatformMeetingsQueryDto,
  ) {
    return this.meetings.list(organization.id, user, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get an organization-created meeting' })
  get(
    @CurrentOrg() organization: RequestOrganization,
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
  ) {
    return this.meetings.get(organization.id, user, id);
  }

  @Post(':id/bot')
  @UseGuards(RolesGuard)
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Queue or retry the Recall bot for a meeting' })
  provisionBot(
    @CurrentOrg() organization: RequestOrganization,
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() input: ProvisionMeetingBotDto,
  ) {
    return this.meetings.provisionBot(organization.id, user, id, input.botName);
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiOperation({
    summary: 'Reschedule or update a provider meeting, calendar event, and bot',
  })
  update(
    @CurrentOrg() organization: RequestOrganization,
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() input: UpdateConnectedMeetingDto,
  ) {
    return this.meetings.update(organization.id, user, id, input);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Cancel the provider meeting and scheduled bot' })
  cancel(
    @CurrentOrg() organization: RequestOrganization,
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
  ) {
    return this.meetings.cancel(organization.id, user, id);
  }
}
