import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Redirect,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
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
import { CrmConnectionsService } from './crm-connections.service';
import { CrmProviderRegistry } from './crm-provider.registry';
import { CrmSyncService } from './crm-sync.service';
import { CrmSyncConfigurationService } from './crm-sync-configuration.service';
import { UpdateCrmSyncConfigurationDto } from './dto/update-crm-sync-configuration.dto';

@ApiTags('CRM Connections')
@ApiBearerAuth()
@Controller('crm/connections')
export class CrmConnectionsController {
  constructor(
    private readonly connections: CrmConnectionsService,
    private readonly sync: CrmSyncService,
    private readonly syncConfiguration: CrmSyncConfigurationService,
    private readonly providers: CrmProviderRegistry,
  ) {}

  @Get(':provider')
  @UseGuards(OrganizationGuard, RolesGuard)
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiOperation({
    summary: 'Get an organization CRM connection status',
    description:
      'Returns the stored HubSpot or Salesforce connection, account identity, default selection, token expiry, and synchronization health without exposing OAuth tokens.',
  })
  connection(
    @CurrentOrg() organization: RequestOrganization,
    @Param('provider') provider: string,
  ) {
    return this.connections.connection(
      organization.id,
      this.providers.parse(provider),
    );
  }

  @Get(':provider/connect')
  @UseGuards(OrganizationGuard, RolesGuard)
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  connect(
    @CurrentOrg() organization: RequestOrganization,
    @CurrentUser() user: RequestUser,
    @Param('provider') provider: string,
  ) {
    return this.connections.connectUrl(
      organization.id,
      user.id,
      this.providers.parse(provider),
    );
  }

  @Public()
  @Get(':provider/callback')
  @Redirect()
  async callback(
    @Param('provider') provider: string,
    @Query('code') code?: string,
    @Query('state') state?: string,
    @Query('error') error?: string,
  ) {
    const crmProvider = this.providers.parse(provider);
    if (error || !code || !state) {
      return {
        url: this.connections.callbackUrl(
          crmProvider,
          false,
          error || 'missing_code_or_state',
        ),
        statusCode: 302,
      };
    }
    try {
      await this.connections.complete(crmProvider, code, state);
      return {
        url: this.connections.callbackUrl(crmProvider, true),
        statusCode: 302,
      };
    } catch {
      return {
        url: this.connections.callbackUrl(crmProvider, false, 'oauth_failed'),
        statusCode: 302,
      };
    }
  }

  @Delete(':provider')
  @UseGuards(OrganizationGuard, RolesGuard)
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  disconnect(
    @CurrentOrg() organization: RequestOrganization,
    @CurrentUser() user: RequestUser,
    @Param('provider') provider: string,
  ) {
    return this.connections.disconnect(
      organization.id,
      user.id,
      this.providers.parse(provider),
    );
  }

  @Patch(':provider/default')
  @UseGuards(OrganizationGuard, RolesGuard)
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  setDefault(
    @CurrentOrg() organization: RequestOrganization,
    @CurrentUser() user: RequestUser,
    @Param('provider') provider: string,
  ) {
    return this.connections.setDefault(
      organization.id,
      user.id,
      this.providers.parse(provider),
    );
  }

  @Post(':provider/sync')
  @UseGuards(OrganizationGuard, RolesGuard)
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  syncProvider(
    @CurrentOrg() organization: RequestOrganization,
    @CurrentUser() user: RequestUser,
    @Param('provider') provider: string,
  ) {
    return this.sync.sync(
      organization.id,
      this.providers.parse(provider),
      user.id,
    );
  }

  @Put(':provider/sync-config')
  @UseGuards(OrganizationGuard, RolesGuard)
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiParam({ name: 'provider', enum: ['HUBSPOT', 'SALESFORCE'] })
  @ApiOperation({
    summary: 'Configure CRM objects and fields for synchronization',
    description:
      'Validates every selected object and field against the connected provider schema before saving the organization-scoped configuration.',
  })
  configureSync(
    @CurrentOrg() organization: RequestOrganization,
    @CurrentUser() user: RequestUser,
    @Param('provider') provider: string,
    @Body() input: UpdateCrmSyncConfigurationDto,
  ) {
    return this.syncConfiguration.update(
      organization.id,
      user.id,
      this.providers.parse(provider),
      input,
    );
  }
}
