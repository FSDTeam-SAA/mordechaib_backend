import {
  Controller,
  Delete,
  Get,
  Param,
  ParseEnumPipe,
  Query,
  Redirect,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentOrg } from '../../common/decorators/current-org.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { EmailProvider } from '../../common/enums/email-provider.enum';
import { UserRole } from '../../common/enums/user-role.enum';
import { OrganizationGuard } from '../../common/guards/organization.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import {
  RequestOrganization,
  RequestUser,
} from '../../common/types/request-context.type';
import { EmailConnectionsService } from './email-connections.service';

@ApiTags('Email Connections')
@ApiBearerAuth()
@Controller('email/connections')
export class EmailConnectionsController {
  constructor(private readonly connections: EmailConnectionsService) {}

  @Get()
  @UseGuards(OrganizationGuard, RolesGuard)
  @Roles(UserRole.OWNER)
  @ApiOperation({ summary: 'List the owner’s connected email accounts' })
  list(
    @CurrentOrg() organization: RequestOrganization,
    @CurrentUser() user: RequestUser,
  ) {
    return this.connections.list(organization.id, user.id);
  }

  @Get(':provider/connect')
  @UseGuards(OrganizationGuard, RolesGuard)
  @Roles(UserRole.OWNER)
  @ApiOperation({ summary: 'Start owner email consent for Google or Outlook' })
  connect(
    @CurrentOrg() organization: RequestOrganization,
    @CurrentUser() user: RequestUser,
    @Param('provider', new ParseEnumPipe(EmailProvider))
    provider: EmailProvider,
  ) {
    return this.connections.connectUrl(organization.id, user.id, provider);
  }

  @Public()
  @Get(':provider/callback')
  @Redirect()
  async callback(
    @Param('provider', new ParseEnumPipe(EmailProvider))
    provider: EmailProvider,
    @Query('code') code?: string,
    @Query('state') state?: string,
    @Query('error') error?: string,
  ) {
    if (error || !code || !state) {
      return {
        url: this.connections.callbackUrl(
          provider,
          false,
          error || 'missing_code_or_state',
        ),
        statusCode: 302,
      };
    }
    try {
      await this.connections.complete(provider, code, state);
      return {
        url: this.connections.callbackUrl(provider, true),
        statusCode: 302,
      };
    } catch {
      return {
        url: this.connections.callbackUrl(provider, false, 'oauth_failed'),
        statusCode: 302,
      };
    }
  }

  @Delete(':provider')
  @UseGuards(OrganizationGuard, RolesGuard)
  @Roles(UserRole.OWNER)
  @ApiOperation({ summary: 'Disconnect an owner email account' })
  disconnect(
    @CurrentOrg() organization: RequestOrganization,
    @CurrentUser() user: RequestUser,
    @Param('provider', new ParseEnumPipe(EmailProvider))
    provider: EmailProvider,
  ) {
    return this.connections.disconnect(organization.id, user.id, provider);
  }
}
