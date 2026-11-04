import { Controller, Get, Header, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
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
import { CrmDashboardService } from './crm-dashboard.service';
import { GetCrmDashboardSummaryQueryDto } from './dto/get-crm-dashboard-summary-query.dto';

@ApiTags('CRM')
@ApiBearerAuth()
@Controller('crm/dashboard')
@UseGuards(OrganizationGuard, RolesGuard)
@Roles(UserRole.OWNER, UserRole.ADMIN)
export class CrmDashboardController {
  constructor(private readonly dashboard: CrmDashboardService) {}

  @Get('summary')
  @Header('Cache-Control', 'private, max-age=30')
  @ApiOperation({
    summary: 'Get the organization CRM dashboard summary cards',
    description:
      'Returns measured task and meeting totals with configured ROI estimates in one organization-scoped response.',
  })
  summary(
    @CurrentOrg() organization: RequestOrganization,
    @CurrentUser() user: RequestUser,
    @Query() query: GetCrmDashboardSummaryQueryDto,
  ) {
    return this.dashboard.summary(organization.id, user.id, query);
  }
}
