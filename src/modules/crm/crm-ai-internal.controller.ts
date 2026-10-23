import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { AiServiceSecretGuard } from '../../common/guards/ai-service-secret.guard';
import { CrmProviderRegistry } from './crm-provider.registry';
import { CrmRecordsService } from './crm-records.service';
import { CrmSchemaDiscoveryService } from './crm-schema-discovery.service';
import { ListCrmRecordsQueryDto } from './dto/list-crm-records-query.dto';

@ApiTags('AI Internal')
@ApiHeader({
  name: 'x-ai-actions-secret',
  required: true,
  description: 'Shared Main Backend/AI Backend service secret',
})
@Controller('ai-internal/organizations/:organizationId/crm')
@Public()
@UseGuards(AiServiceSecretGuard)
export class CrmAiInternalController {
  constructor(
    private readonly discovery: CrmSchemaDiscoveryService,
    private readonly records: CrmRecordsService,
    private readonly providers: CrmProviderRegistry,
  ) {}

  @Get(':provider/objects')
  @ApiParam({ name: 'provider', enum: ['HUBSPOT', 'SALESFORCE'] })
  @ApiOperation({
    summary: 'List organization CRM objects for grounded AI chat',
  })
  listObjects(
    @Param('organizationId') organizationId: string,
    @Param('provider') provider: string,
  ) {
    return this.discovery.listObjects(
      organizationId,
      this.providers.parse(provider),
    );
  }

  @Get(':provider/objects/:objectType/schema')
  @ApiOperation({
    summary: 'Get authoritative CRM schema for grounded AI proposals',
  })
  describeObject(
    @Param('organizationId') organizationId: string,
    @Param('provider') provider: string,
    @Param('objectType') objectType: string,
  ) {
    return this.discovery.describeObject(
      organizationId,
      this.providers.parse(provider),
      objectType,
    );
  }

  @Get(':provider/objects/:objectType/records')
  @ApiOperation({
    summary: 'List synchronized CRM records for grounded AI proposals',
    description:
      'Read-only and paginated. The AI must use the returned externalId in an update proposal.',
  })
  listRecords(
    @Param('organizationId') organizationId: string,
    @Param('provider') provider: string,
    @Param('objectType') objectType: string,
    @Query() query: ListCrmRecordsQueryDto,
  ) {
    return this.records.list(organizationId, {
      ...query,
      provider: this.providers.parse(provider),
      objectType,
    });
  }
}
