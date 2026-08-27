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
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentOrg } from '../../common/decorators/current-org.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { MeetingPlatform } from '../../common/enums/meeting-platform.enum';
import { OrganizationGuard } from '../../common/guards/organization.guard';
import {
  RequestOrganization,
  RequestUser,
} from '../../common/types/request-context.type';
import { CreateGoogleMeetingDto } from './dto/create-google-meeting.dto';
import { ListMeetingBotsQueryDto } from './dto/list-meeting-bots-query.dto';
import { UpdateMeetingBotDto } from './dto/update-meeting-bot.dto';
import { MeetingBotsService } from './meeting-bots.service';

@ApiTags('Google Meetings')
@ApiBearerAuth()
@Controller('google-meetings')
@UseGuards(OrganizationGuard)
export class GoogleMeetingsController {
  constructor(private readonly meetings: MeetingBotsService) {}

  @Post()
  create(
    @CurrentOrg() organization: RequestOrganization,
    @CurrentUser() user: RequestUser,
    @Body() input: CreateGoogleMeetingDto,
  ) {
    return this.meetings.create(
      organization.id,
      user.id,
      MeetingPlatform.GOOGLE_MEET,
      input,
    );
  }

  @Get()
  list(
    @CurrentOrg() organization: RequestOrganization,
    @Query() query: ListMeetingBotsQueryDto,
  ) {
    return this.meetings.list(
      organization.id,
      query,
      MeetingPlatform.GOOGLE_MEET,
    );
  }

  @Get(':id')
  get(
    @CurrentOrg() organization: RequestOrganization,
    @Param('id') id: string,
  ) {
    return this.meetings.get(organization.id, id, MeetingPlatform.GOOGLE_MEET);
  }

  @Get(':id/transcript')
  getTranscript(
    @CurrentOrg() organization: RequestOrganization,
    @Param('id') id: string,
  ) {
    return this.meetings.getTranscript(
      organization.id,
      id,
      MeetingPlatform.GOOGLE_MEET,
    );
  }

  @Get(':id/audio')
  getAudio(
    @CurrentOrg() organization: RequestOrganization,
    @Param('id') id: string,
  ) {
    return this.meetings.getAudio(
      organization.id,
      id,
      MeetingPlatform.GOOGLE_MEET,
    );
  }

  @Patch(':id')
  updateScheduled(
    @CurrentOrg() organization: RequestOrganization,
    @Param('id') id: string,
    @Body() input: UpdateMeetingBotDto,
  ) {
    return this.meetings.updateScheduled(
      organization.id,
      id,
      input,
      MeetingPlatform.GOOGLE_MEET,
    );
  }

  @Delete(':id')
  cancel(
    @CurrentOrg() organization: RequestOrganization,
    @Param('id') id: string,
  ) {
    return this.meetings.cancel(
      organization.id,
      id,
      MeetingPlatform.GOOGLE_MEET,
    );
  }

  @Post(':id/leave')
  leave(
    @CurrentOrg() organization: RequestOrganization,
    @Param('id') id: string,
  ) {
    return this.meetings.leave(
      organization.id,
      id,
      MeetingPlatform.GOOGLE_MEET,
    );
  }
}
