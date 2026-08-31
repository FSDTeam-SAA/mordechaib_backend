import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
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
import { OrganizationGuard } from '../../common/guards/organization.guard';
import {
  RequestOrganization,
  RequestUser,
} from '../../common/types/request-context.type';
import { CreateConnectedMeetingDto } from './dto/create-connected-meeting.dto';
import { ListPlatformMeetingsQueryDto } from './dto/list-platform-meetings-query.dto';
import { PlatformMeetingsService } from './platform-meetings.service';

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
  @ApiOperation({ summary: 'Queue or retry the Recall bot for a meeting' })
  provisionBot(
    @CurrentOrg() organization: RequestOrganization,
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() input: ProvisionMeetingBotDto,
  ) {
    return this.meetings.provisionBot(organization.id, user, id, input.botName);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Cancel the provider meeting and scheduled bot' })
  cancel(
    @CurrentOrg() organization: RequestOrganization,
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
  ) {
    return this.meetings.cancel(organization.id, user, id);
  }
}
