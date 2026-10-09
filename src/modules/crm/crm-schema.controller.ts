import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentOrg } from '../../common/decorators/current-org.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/enums/user-role.enum';
import { OrganizationGuard } from '../../common/guards/organization.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { RequestOrganization } from '../../common/types/request-context.type';
import { CrmProviderRegistry } from './crm-provider.registry';
import { CrmSchemaDiscoveryService } from './crm-schema-discovery.service';

@ApiTags('CRM Schema Discovery')
@ApiBearerAuth()
@Controller('crm/:provider/objects')
@UseGuards(OrganizationGuard, RolesGuard)
@Roles(UserRole.OWNER, UserRole.ADMIN)
export class CrmSchemaController {
  constructor(
    private readonly discovery: CrmSchemaDiscoveryService,
    private readonly providers: CrmProviderRegistry,
  ) {}

  @Get()
  @ApiParam({ name: 'provider', enum: ['HUBSPOT', 'SALESFORCE'] })
  @ApiOperation({
    summary: 'List CRM objects available to the connected account',
    description:
      'Returns provider-normalized standard and custom objects that the connected HubSpot or Salesforce account can discover.',
  })
  listObjects(
    @CurrentOrg() organization: RequestOrganization,
    @Param('provider') provider: string,
  ) {
    return this.discovery.listObjects(
      organization.id,
      this.providers.parse(provider),
    );
  }

  @Get(':objectType/schema')
  @ApiParam({ name: 'provider', enum: ['HUBSPOT', 'SALESFORCE'] })
  @ApiParam({
    name: 'objectType',
    description:
      'Provider object identifier, for example contacts, Account, Project__c, or a HubSpot custom object type ID.',
  })
  @ApiOperation({
    summary: 'Get normalized fields for one CRM object',
    description:
      'Returns the connected account field metadata and read/write capabilities for sync configuration.',
  })
  describeObject(
    @CurrentOrg() organization: RequestOrganization,
    @Param('provider') provider: string,
    @Param('objectType') objectType: string,
  ) {
    return this.discovery.describeObject(
      organization.id,
      this.providers.parse(provider),
      objectType,
    );
  }
}
