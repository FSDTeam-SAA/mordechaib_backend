import {
  BadRequestException,
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
import { Public } from '../../common/decorators/public.decorator';
import { MeetingPlatform } from '../../common/enums/meeting-platform.enum';
import { OrganizationGuard } from '../../common/guards/organization.guard';
import { PlatformAdminGuard } from '../../common/guards/platform-admin.guard';
import {
  RequestOrganization,
  RequestUser,
} from '../../common/types/request-context.type';
import { CreateZoomMeetingDto } from './dto/create-zoom-meeting.dto';
import { ListMeetingBotsQueryDto } from './dto/list-meeting-bots-query.dto';
import { UpdateMeetingBotDto } from './dto/update-meeting-bot.dto';
import { MeetingBotsService } from './meeting-bots.service';
import { ZoomAuthService } from './zoom-auth.service';

@ApiTags('Zoom Meetings')
@ApiBearerAuth()
@Controller('zoom-meetings')
export class ZoomMeetingsController {
  constructor(
    private readonly meetings: MeetingBotsService,
    private readonly zoomAuth: ZoomAuthService,
  ) {}

  @Post()
  @UseGuards(OrganizationGuard)
  create(
    @CurrentOrg() organization: RequestOrganization,
    @CurrentUser() user: RequestUser,
    @Body() input: CreateZoomMeetingDto,
  ) {
    return this.meetings.create(
      organization.id,
      user.id,
      MeetingPlatform.ZOOM,
      input,
    );
  }

  @Get()
  @UseGuards(OrganizationGuard)
  list(
    @CurrentOrg() organization: RequestOrganization,
    @Query() query: ListMeetingBotsQueryDto,
  ) {
    return this.meetings.list(organization.id, query, MeetingPlatform.ZOOM);
  }

  @Get('oauth/connect')
  @UseGuards(PlatformAdminGuard)
  connectZoom(@CurrentUser() user: RequestUser) {
    return this.zoomAuth.createAuthorizationUrl(user.id);
  }

  @Public()
  @Get('oauth/callback')
  completeZoomConnection(
    @Query('code') code: string,
    @Query('state') state: string,
    @Query('error') error?: string,
  ) {
    if (error) throw new BadRequestException(`Zoom OAuth failed: ${error}`);
    if (!code || !state) {
      throw new BadRequestException('Zoom OAuth code and state are required');
    }
    return this.zoomAuth.completeAuthorization(code, state);
  }

  @Get('oauth/connection')
  @UseGuards(PlatformAdminGuard)
  getZoomConnection() {
    return this.zoomAuth.getConnection();
  }

  @Get(':id')
  @UseGuards(OrganizationGuard)
  get(
    @CurrentOrg() organization: RequestOrganization,
    @Param('id') id: string,
  ) {
    return this.meetings.get(organization.id, id, MeetingPlatform.ZOOM);
  }

  @Get(':id/transcript')
  @UseGuards(OrganizationGuard)
  getTranscript(
    @CurrentOrg() organization: RequestOrganization,
    @Param('id') id: string,
  ) {
    return this.meetings.getTranscript(
      organization.id,
      id,
      MeetingPlatform.ZOOM,
    );
  }

  @Get(':id/audio')
  @UseGuards(OrganizationGuard)
  getAudio(
    @CurrentOrg() organization: RequestOrganization,
    @Param('id') id: string,
  ) {
    return this.meetings.getAudio(organization.id, id, MeetingPlatform.ZOOM);
  }

  @Patch(':id')
  @UseGuards(OrganizationGuard)
  updateScheduled(
    @CurrentOrg() organization: RequestOrganization,
    @Param('id') id: string,
    @Body() input: UpdateMeetingBotDto,
  ) {
    return this.meetings.updateScheduled(
      organization.id,
      id,
      input,
      MeetingPlatform.ZOOM,
    );
  }

  @Delete(':id')
  @UseGuards(OrganizationGuard)
  cancel(
    @CurrentOrg() organization: RequestOrganization,
    @Param('id') id: string,
  ) {
    return this.meetings.cancel(organization.id, id, MeetingPlatform.ZOOM);
  }

  @Post(':id/leave')
  @UseGuards(OrganizationGuard)
  leave(
    @CurrentOrg() organization: RequestOrganization,
    @Param('id') id: string,
  ) {
    return this.meetings.leave(organization.id, id, MeetingPlatform.ZOOM);
  }
}
