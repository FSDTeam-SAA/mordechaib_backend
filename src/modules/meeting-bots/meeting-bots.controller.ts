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
import { OrganizationGuard } from '../../common/guards/organization.guard';
import {
  RequestOrganization,
  RequestUser,
} from '../../common/types/request-context.type';
import { CreateMeetingBotDto } from './dto/create-meeting-bot.dto';
import { ListMeetingBotsQueryDto } from './dto/list-meeting-bots-query.dto';
import { UpdateMeetingBotDto } from './dto/update-meeting-bot.dto';
import { MeetingBotsService } from './meeting-bots.service';

@ApiTags('Meeting Bots (Manual URL)')
@ApiBearerAuth()
@Controller('meeting-bots')
@UseGuards(OrganizationGuard)
export class MeetingBotsController {
  constructor(private readonly meetings: MeetingBotsService) {}

  @Post()
  @ApiOperation({
    summary: 'Send a Recall bot to an existing meeting URL',
    description:
      'Manual bot-only flow and therefore requires meetingUrl. Use POST /api/v1/meetings when the connected provider should create the meeting URL.',
  })
  create(
    @CurrentOrg() organization: RequestOrganization,
    @CurrentUser() user: RequestUser,
    @Body() input: CreateMeetingBotDto,
  ) {
    return this.meetings.create(
      organization.id,
      user.id,
      input.platform,
      input,
    );
  }

  @Get()
  list(
    @CurrentOrg() organization: RequestOrganization,
    @Query() query: ListMeetingBotsQueryDto,
  ) {
    return this.meetings.list(organization.id, query);
  }

  @Get(':id')
  get(
    @CurrentOrg() organization: RequestOrganization,
    @Param('id') id: string,
  ) {
    return this.meetings.get(organization.id, id);
  }

  @Get(':id/transcript')
  @ApiOperation({
    summary: 'Get a meeting bot transcript',
    description:
      'Use the meeting bot id returned as meetingBotId by the connected meeting flow.',
  })
  getTranscript(
    @CurrentOrg() organization: RequestOrganization,
    @Param('id') id: string,
  ) {
    return this.meetings.getTranscript(organization.id, id);
  }

  @Get(':id/audio')
  @ApiOperation({
    summary: 'Get a temporary meeting audio download URL',
    description:
      'Use the meeting bot id returned as meetingBotId by the connected meeting flow.',
  })
  getAudio(
    @CurrentOrg() organization: RequestOrganization,
    @Param('id') id: string,
  ) {
    return this.meetings.getAudio(organization.id, id);
  }

  @Patch(':id')
  updateScheduled(
    @CurrentOrg() organization: RequestOrganization,
    @Param('id') id: string,
    @Body() input: UpdateMeetingBotDto,
  ) {
    return this.meetings.updateScheduled(organization.id, id, input);
  }

  @Delete(':id')
  cancel(
    @CurrentOrg() organization: RequestOrganization,
    @Param('id') id: string,
  ) {
    return this.meetings.cancel(organization.id, id);
  }

  @Post(':id/leave')
  leave(
    @CurrentOrg() organization: RequestOrganization,
    @Param('id') id: string,
  ) {
    return this.meetings.leave(organization.id, id);
  }
}
