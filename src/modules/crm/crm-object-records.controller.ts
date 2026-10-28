import {
  Body,
  Controller,
  Param,
  Patch,
  Post,
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
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/enums/user-role.enum';
import { OrganizationGuard } from '../../common/guards/organization.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import {
  RequestOrganization,
  RequestUser,
} from '../../common/types/request-context.type';
import { CrmProviderRegistry } from './crm-provider.registry';
import { CrmRecordsService } from './crm-records.service';
import { CreateCrmRecordDto } from './dto/create-crm-record.dto';
import { UpdateCrmRecordDto } from './dto/update-crm-record.dto';

@ApiTags('CRM Records')
@ApiBearerAuth()
@Controller('crm/:provider/objects/:objectType/records')
@UseGuards(OrganizationGuard, RolesGuard)
@Roles(UserRole.OWNER, UserRole.ADMIN)
export class CrmObjectRecordsController {
  constructor(
    private readonly records: CrmRecordsService,
    private readonly providers: CrmProviderRegistry,
  ) {}

  @Post()
  @ApiParam({ name: 'provider', enum: ['HUBSPOT', 'SALESFORCE'] })
  @ApiParam({
    name: 'objectType',
    description: 'Provider object identifier returned by CRM schema discovery',
  })
  @ApiOperation({
    summary: 'Create a schema-validated CRM record',
    description:
      'Validates object permissions, required fields, field capabilities and values against the connected provider schema before creating and locally synchronizing the record.',
  })
  create(
    @CurrentOrg() organization: RequestOrganization,
    @CurrentUser() user: RequestUser,
    @Param('provider') provider: string,
    @Param('objectType') objectType: string,
    @Body() input: CreateCrmRecordDto,
  ) {
    return this.records.create(
      organization.id,
      user.id,
      this.providers.parse(provider),
      objectType,
      input,
    );
  }

  @Patch(':externalId')
  @ApiParam({ name: 'provider', enum: ['HUBSPOT', 'SALESFORCE'] })
  @ApiParam({
    name: 'objectType',
    description: 'Provider object identifier returned by CRM schema discovery',
  })
  @ApiParam({
    name: 'externalId',
    description: 'Record identifier assigned by the CRM provider',
  })
  @ApiOperation({
    summary: 'Update a schema-validated CRM record',
    description:
      'Validates the requested fields and values against the connected provider schema, optionally enforces optimistic concurrency, updates the provider, and refreshes the locally synchronized record.',
  })
  update(
    @CurrentOrg() organization: RequestOrganization,
    @CurrentUser() user: RequestUser,
    @Param('provider') provider: string,
    @Param('objectType') objectType: string,
    @Param('externalId') externalId: string,
    @Body() input: UpdateCrmRecordDto,
  ) {
    return this.records.update(
      organization.id,
      user.id,
      this.providers.parse(provider),
      objectType,
      externalId,
      input,
    );
  }
}
