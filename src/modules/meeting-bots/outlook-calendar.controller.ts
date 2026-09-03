import {
  Controller,
  Delete,
  Get,
  Logger,
  Query,
  Redirect,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentOrg } from '../../common/decorators/current-org.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/enums/user-role.enum';
import { OrganizationGuard } from '../../common/guards/organization.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import {
  RequestOrganization,
  RequestUser,
} from '../../common/types/request-context.type';
import { OutlookCalendarAuthService } from './outlook-calendar-auth.service';

@ApiTags('Outlook Calendar Connection')
@ApiBearerAuth()
@Controller('calendar/outlook')
export class OutlookCalendarController {
  private readonly logger = new Logger(OutlookCalendarController.name);

  constructor(private readonly auth: OutlookCalendarAuthService) {}

  @Get('oauth/connect')
  @UseGuards(OrganizationGuard, RolesGuard)
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Connect the organization Outlook calendar' })
  connect(
    @CurrentOrg() organization: RequestOrganization,
    @CurrentUser() user: RequestUser,
  ) {
    return this.auth.createAuthorizationUrl(organization.id, user.id);
  }

  @Public()
  @Get('oauth/callback')
  @Redirect()
  async callback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Query('error') error?: string,
  ) {
    if (error) {
      return { url: this.auth.callbackUrl(false, error), statusCode: 302 };
    }
    if (!code || !state) {
      return {
        url: this.auth.callbackUrl(false, 'missing_code_or_state'),
        statusCode: 302,
      };
    }
    try {
      await this.auth.completeAuthorization(code, state);
      return { url: this.auth.callbackUrl(true), statusCode: 302 };
    } catch (callbackError) {
      this.logger.error(
        `Outlook OAuth callback failed: ${this.errorMessage(callbackError)}`,
        callbackError instanceof Error ? callbackError.stack : undefined,
      );
      return {
        url: this.auth.callbackUrl(false, 'oauth_failed'),
        statusCode: 302,
      };
    }
  }

  @Get('oauth/connection')
  @UseGuards(OrganizationGuard)
  getConnection(@CurrentOrg() organization: RequestOrganization) {
    return this.auth.getConnection(organization.id);
  }

  @Delete('oauth/connection')
  @UseGuards(OrganizationGuard, RolesGuard)
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  disconnect(@CurrentOrg() organization: RequestOrganization) {
    return this.auth.disconnect(organization.id);
  }

  private errorMessage(error: unknown) {
    return error instanceof Error ? error.message : 'Unknown callback error';
  }
}
