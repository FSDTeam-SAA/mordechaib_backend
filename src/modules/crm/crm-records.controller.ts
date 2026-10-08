import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentOrg } from '../../common/decorators/current-org.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/enums/user-role.enum';
import { OrganizationGuard } from '../../common/guards/organization.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { RequestOrganization } from '../../common/types/request-context.type';
import { CrmRecordsService } from './crm-records.service';
import { ListCrmRecordsQueryDto } from './dto/list-crm-records-query.dto';

@ApiTags('CRM Records')
@ApiBearerAuth()
@Controller('crm/records')
@UseGuards(OrganizationGuard, RolesGuard)
@Roles(UserRole.OWNER, UserRole.ADMIN)
export class CrmRecordsController {
  constructor(private readonly records: CrmRecordsService) {}

  @Get()
  @ApiOperation({
    summary: 'List locally synchronized CRM records',
    description:
      'Returns organization-scoped normalized records without the retained raw provider payload.',
  })
  list(
    @CurrentOrg() organization: RequestOrganization,
    @Query() query: ListCrmRecordsQueryDto,
  ) {
    return this.records.list(organization.id, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one locally synchronized CRM record' })
  get(
    @CurrentOrg() organization: RequestOrganization,
    @Param('id') id: string,
  ) {
    return this.records.get(organization.id, id);
  }
}
