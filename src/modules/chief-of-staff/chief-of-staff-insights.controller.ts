import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentOrg } from '../../common/decorators/current-org.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/enums/user-role.enum';
import { OrganizationGuard } from '../../common/guards/organization.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { RequestOrganization } from '../../common/types/request-context.type';
import { ChiefOfStaffInsightsService } from './chief-of-staff-insights.service';
import {
  GetAiInsightsQueryDto,
  ListAgentActivityQueryDto,
} from './dto/get-ai-insights-query.dto';

@ApiTags('Chief of Staff')
@ApiBearerAuth()
@Controller('chief-of-staff/insights')
@UseGuards(OrganizationGuard, RolesGuard)
@Roles(UserRole.OWNER, UserRole.ADMIN)
export class ChiefOfStaffInsightsController {
  constructor(private readonly insights: ChiefOfStaffInsightsService) {}

  @Get('agent-activity')
  @ApiOperation({ summary: 'List recent AI agent runtime activity' })
  listAgentActivity(
    @CurrentOrg() organization: RequestOrganization,
    @Query() query: ListAgentActivityQueryDto,
  ) {
    return this.insights.listAgentActivity(organization.id, query);
  }

  @Get('ai-health')
  @ApiOperation({ summary: 'Get measured AI runtime health metrics' })
  aiHealth(
    @CurrentOrg() organization: RequestOrganization,
    @Query() query: GetAiInsightsQueryDto,
  ) {
    return this.insights.aiHealth(organization.id, query);
  }
}
