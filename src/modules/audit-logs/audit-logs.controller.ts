import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentOrg } from '../../common/decorators/current-org.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/enums/user-role.enum';
import { OrganizationGuard } from '../../common/guards/organization.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { RequestOrganization } from '../../common/types/request-context.type';
import { AuditLogsService } from './audit-logs.service';

@ApiTags('Audit logs')
@ApiBearerAuth()
@Controller('audit-logs')
@UseGuards(OrganizationGuard, RolesGuard)
@Roles(UserRole.OWNER, UserRole.ADMIN)
export class AuditLogsController {
  constructor(private readonly service: AuditLogsService) {}

  @Get()
  findAll(@CurrentOrg() organization: RequestOrganization) {
    return this.service.findByOrganization(organization.id);
  }
}
