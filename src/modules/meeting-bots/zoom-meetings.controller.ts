import {
  Body,
  Controller,
  Delete,
  Get,
  Logger,
  Param,
  Patch,
  Post,
  Query,
  Redirect,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiExcludeEndpoint,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
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
import { CreateZoomMeetingDto } from './dto/create-zoom-meeting.dto';
import { ListMeetingBotsQueryDto } from './dto/list-meeting-bots-query.dto';
import { UpdateMeetingBotDto } from './dto/update-meeting-bot.dto';
import { MeetingBotsService } from './meeting-bots.service';
import { RecallApiError } from './providers/recall.types';
import { ZoomAuthService, ZoomOAuthConnectionError } from './zoom-auth.service';

@ApiTags('Connections')
@ApiBearerAuth()
@Controller('zoom-meetings')
export class ZoomMeetingsController {
  private readonly logger = new Logger(ZoomMeetingsController.name);

  constructor(
    private readonly meetings: MeetingBotsService,
    private readonly zoomAuth: ZoomAuthService,
  ) {}

  @Post()
  @ApiExcludeEndpoint()
  @UseGuards(OrganizationGuard)
  @ApiOperation({
    summary: 'Send a Recall bot to an existing Zoom meeting URL',
    description:
      'Legacy/manual flow. This endpoint requires meetingUrl. To create a new Zoom meeting from a connected organizer account, use POST /api/v1/meetings.',
  })
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
  @ApiExcludeEndpoint()
  @UseGuards(OrganizationGuard)
  list(
    @CurrentOrg() organization: RequestOrganization,
    @Query() query: ListMeetingBotsQueryDto,
  ) {
    return this.meetings.list(organization.id, query, MeetingPlatform.ZOOM);
  }

  @Get('oauth/connect')
  @UseGuards(OrganizationGuard, RolesGuard)
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  connectZoom(
    @CurrentOrg() organization: RequestOrganization,
    @CurrentUser() user: RequestUser,
  ) {
    return this.zoomAuth.createAuthorizationUrl(organization.id, user.id);
  }

  @Public()
  @Get('oauth/callback')
  @Redirect()
  async completeZoomConnection(
    @Query('code') code: string,
    @Query('state') state: string,
    @Query('error') error?: string,
  ) {
    if (error) {
      this.logger.warn(
        `Zoom OAuth authorization was rejected before callback completion: providerError=${this.safeLogValue(error)}`,
      );
      return {
        url: this.zoomAuth.callbackUrl(false, error),
        statusCode: 302,
      };
    }
    if (!code || !state) {
      this.logger.warn(
        `Zoom OAuth callback is missing required parameters: codePresent=${Boolean(code)} statePresent=${Boolean(state)}`,
      );
      return {
        url: this.zoomAuth.callbackUrl(false, 'missing_code_or_state'),
        statusCode: 302,
      };
    }
    try {
      const connection = await this.zoomAuth.completeAuthorization(code, state);
      this.logger.log(
        `Zoom OAuth connection completed: organizationId=${connection.organizationId}`,
      );
      return { url: this.zoomAuth.callbackUrl(true), statusCode: 302 };
    } catch (callbackError) {
      this.logger.error(this.oauthErrorMessage(callbackError));
      return {
        url: this.zoomAuth.callbackUrl(false, 'oauth_failed'),
        statusCode: 302,
      };
    }
  }

  private oauthErrorMessage(error: unknown) {
    if (error instanceof ZoomOAuthConnectionError) {
      const cause = error.originalError;
      if (cause instanceof RecallApiError) {
        return (
          `Zoom OAuth callback failed: stage=${error.stage} ` +
          `provider=Recall.ai httpStatus=${cause.status} ` +
          `providerMessage=${this.safeLogValue(cause.message)}`
        );
      }
      return (
        `Zoom OAuth callback failed: stage=${error.stage} ` +
        `errorType=${this.safeLogValue(this.errorType(cause))} ` +
        `message=${this.safeLogValue(this.errorMessage(cause))}`
      );
    }

    return (
      'Zoom OAuth callback failed: stage=UNEXPECTED ' +
      `errorType=${this.safeLogValue(this.errorType(error))} ` +
      `message=${this.safeLogValue(this.errorMessage(error))}`
    );
  }

  private errorType(error: unknown) {
    return error instanceof Error ? error.name : typeof error;
  }

  private errorMessage(error: unknown) {
    return error instanceof Error ? error.message : 'Unknown callback error';
  }

  private safeLogValue(value: string) {
    return JSON.stringify(value.slice(0, 500));
  }

  @Get('oauth/connection')
  @UseGuards(OrganizationGuard)
  getZoomConnection(@CurrentOrg() organization: RequestOrganization) {
    return this.zoomAuth.getConnection(organization.id);
  }

  @Delete('oauth/connection')
  @UseGuards(OrganizationGuard, RolesGuard)
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  disconnectZoom(@CurrentOrg() organization: RequestOrganization) {
    return this.zoomAuth.disconnect(organization.id);
  }

  @Get(':id')
  @ApiExcludeEndpoint()
  @UseGuards(OrganizationGuard)
  get(
    @CurrentOrg() organization: RequestOrganization,
    @Param('id') id: string,
  ) {
    return this.meetings.get(organization.id, id, MeetingPlatform.ZOOM);
  }

  @Get(':id/transcript')
  @ApiExcludeEndpoint()
  @UseGuards(OrganizationGuard)
  @ApiOperation({ summary: 'Get a Zoom meeting bot transcript' })
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
  @ApiExcludeEndpoint()
  @UseGuards(OrganizationGuard)
  @ApiOperation({ summary: 'Get a temporary Zoom meeting audio URL' })
  getAudio(
    @CurrentOrg() organization: RequestOrganization,
    @Param('id') id: string,
  ) {
    return this.meetings.getAudio(organization.id, id, MeetingPlatform.ZOOM);
  }

  @Patch(':id')
  @ApiExcludeEndpoint()
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
  @ApiExcludeEndpoint()
  @UseGuards(OrganizationGuard)
  cancel(
    @CurrentOrg() organization: RequestOrganization,
    @Param('id') id: string,
  ) {
    return this.meetings.cancel(organization.id, id, MeetingPlatform.ZOOM);
  }

  @Post(':id/leave')
  @ApiExcludeEndpoint()
  @UseGuards(OrganizationGuard)
  leave(
    @CurrentOrg() organization: RequestOrganization,
    @Param('id') id: string,
  ) {
    return this.meetings.leave(organization.id, id, MeetingPlatform.ZOOM);
  }
}
