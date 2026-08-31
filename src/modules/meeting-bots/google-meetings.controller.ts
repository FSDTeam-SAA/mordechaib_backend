import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Redirect,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentOrg } from '../../common/decorators/current-org.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { MeetingPlatform } from '../../common/enums/meeting-platform.enum';
import { UserRole } from '../../common/enums/user-role.enum';
import { OrganizationGuard } from '../../common/guards/organization.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import {
  RequestOrganization,
  RequestUser,
} from '../../common/types/request-context.type';
import { CreateGoogleMeetingDto } from './dto/create-google-meeting.dto';
import { ListMeetingBotsQueryDto } from './dto/list-meeting-bots-query.dto';
import { UpdateMeetingBotDto } from './dto/update-meeting-bot.dto';
import { MeetingBotsService } from './meeting-bots.service';
import { GoogleMeetAuthService } from './google-meet-auth.service';

@ApiTags('Google Meetings')
@ApiBearerAuth()
@Controller('google-meetings')
export class GoogleMeetingsController {
  constructor(
    private readonly meetings: MeetingBotsService,
    private readonly googleAuth: GoogleMeetAuthService,
  ) {}

  @Get('oauth/connect')
  @UseGuards(OrganizationGuard, RolesGuard)
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  connectGoogle(
    @CurrentOrg() organization: RequestOrganization,
    @CurrentUser() user: RequestUser,
  ) {
    return this.googleAuth.createAuthorizationUrl(organization.id, user.id);
  }

  @Public()
  @Get('oauth/callback')
  @Redirect()
  async completeGoogleConnection(
    @Query('code') code: string,
    @Query('state') state: string,
    @Query('error') error?: string,
  ) {
    if (error) {
      return {
        url: this.googleAuth.callbackUrl(false, error),
        statusCode: 302,
      };
    }
    if (!code || !state) {
      return {
        url: this.googleAuth.callbackUrl(false, 'missing_code_or_state'),
        statusCode: 302,
      };
    }
    try {
      await this.googleAuth.completeAuthorization(code, state);
      return { url: this.googleAuth.callbackUrl(true), statusCode: 302 };
    } catch {
      return {
        url: this.googleAuth.callbackUrl(false, 'oauth_failed'),
        statusCode: 302,
      };
    }
  }

  @Get('oauth/connection')
  @UseGuards(OrganizationGuard)
  getGoogleConnection(@CurrentOrg() organization: RequestOrganization) {
    return this.googleAuth.getConnection(organization.id);
  }

  @Delete('oauth/connection')
  @UseGuards(OrganizationGuard, RolesGuard)
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  disconnectGoogle(@CurrentOrg() organization: RequestOrganization) {
    return this.googleAuth.disconnect(organization.id);
  }

  @Post()
  @UseGuards(OrganizationGuard)
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
  @UseGuards(OrganizationGuard)
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
  @UseGuards(OrganizationGuard)
  get(
    @CurrentOrg() organization: RequestOrganization,
    @Param('id') id: string,
  ) {
    return this.meetings.get(organization.id, id, MeetingPlatform.GOOGLE_MEET);
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
      MeetingPlatform.GOOGLE_MEET,
    );
  }

  @Get(':id/audio')
  @UseGuards(OrganizationGuard)
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
      MeetingPlatform.GOOGLE_MEET,
    );
  }

  @Delete(':id')
  @UseGuards(OrganizationGuard)
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
  @UseGuards(OrganizationGuard)
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
