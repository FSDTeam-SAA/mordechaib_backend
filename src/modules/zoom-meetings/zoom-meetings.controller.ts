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
import { OrganizationGuard } from '../../common/guards/organization.guard';
import { PlatformAdminGuard } from '../../common/guards/platform-admin.guard';
import {
  RequestOrganization,
  RequestUser,
} from '../../common/types/request-context.type';
import { CreateZoomMeetingDto } from './dto/create-zoom-meeting.dto';
import { ListZoomMeetingsQueryDto } from './dto/list-zoom-meetings-query.dto';
import { UpdateZoomMeetingDto } from './dto/update-zoom-meeting.dto';
import { ZoomMeetingsService } from './zoom-meetings.service';

@ApiTags('Zoom Meetings')
@ApiBearerAuth()
@Controller('zoom-meetings')
export class ZoomMeetingsController {
  constructor(private readonly meetings: ZoomMeetingsService) {}

  @Post()
  @UseGuards(OrganizationGuard)
  create(
    @CurrentOrg() organization: RequestOrganization,
    @CurrentUser() user: RequestUser,
    @Body() input: CreateZoomMeetingDto,
  ) {
    return this.meetings.create(organization.id, user.id, input);
  }

  @Get()
  @UseGuards(OrganizationGuard)
  list(
    @CurrentOrg() organization: RequestOrganization,
    @Query() query: ListZoomMeetingsQueryDto,
  ) {
    return this.meetings.list(organization.id, query);
  }

  @Get('oauth/connect')
  @UseGuards(PlatformAdminGuard)
  connectZoom(@CurrentUser() user: RequestUser) {
    return this.meetings.createZoomAuthorizationUrl(user.id);
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
    return this.meetings.completeZoomAuthorization(code, state);
  }

  @Get('oauth/connection')
  @UseGuards(PlatformAdminGuard)
  getZoomConnection() {
    return this.meetings.getZoomConnection();
  }

  @Get(':id')
  @UseGuards(OrganizationGuard)
  get(
    @CurrentOrg() organization: RequestOrganization,
    @Param('id') id: string,
  ) {
    return this.meetings.get(organization.id, id);
  }

  @Get(':id/transcript')
  @UseGuards(OrganizationGuard)
  getTranscript(
    @CurrentOrg() organization: RequestOrganization,
    @Param('id') id: string,
  ) {
    return this.meetings.getTranscript(organization.id, id);
  }

  @Get(':id/audio')
  @UseGuards(OrganizationGuard)
  getAudio(
    @CurrentOrg() organization: RequestOrganization,
    @Param('id') id: string,
  ) {
    return this.meetings.getAudio(organization.id, id);
  }

  @Patch(':id')
  @UseGuards(OrganizationGuard)
  updateScheduled(
    @CurrentOrg() organization: RequestOrganization,
    @Param('id') id: string,
    @Body() input: UpdateZoomMeetingDto,
  ) {
    return this.meetings.updateScheduled(organization.id, id, input);
  }

  @Delete(':id')
  @UseGuards(OrganizationGuard)
  cancel(
    @CurrentOrg() organization: RequestOrganization,
    @Param('id') id: string,
  ) {
    return this.meetings.cancel(organization.id, id);
  }

  @Post(':id/leave')
  @UseGuards(OrganizationGuard)
  leave(
    @CurrentOrg() organization: RequestOrganization,
    @Param('id') id: string,
  ) {
    return this.meetings.leave(organization.id, id);
  }
}
