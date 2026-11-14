import { Body, Controller, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PlatformAdminGuard } from '../../common/guards/platform-admin.guard';
import { RequestUser } from '../../common/types/request-context.type';
import { ListOrgTeamMembersQueryDto } from '../org-team/dto/list-org-team-members-query.dto';
import { OrgTeamService } from '../org-team/org-team.service';
import { ChangeOrganizationPlanDto } from './dto/change-organization-plan.dto';
import { ListOrganizationsAdminQueryDto } from './dto/list-organizations-admin-query.dto';
import { UpdateOrganizationStatusDto } from './dto/update-organization-status.dto';
import { OrganizationsAdminService } from './organizations-admin.service';

@ApiTags('Organizations (platform admin)')
@ApiBearerAuth()
@Controller('organizations-admin')
@UseGuards(PlatformAdminGuard)
export class OrganizationsAdminController {
  constructor(
    private readonly service: OrganizationsAdminService,
    private readonly orgTeam: OrgTeamService,
  ) {}

  @Get()
  list(@Query() query: ListOrganizationsAdminQueryDto) {
    return this.service.list(query);
  }

  @Get('team-members')
  @ApiOperation({
    summary: 'List all customer organization team members across all organizations',
  })
  listAllMembers(@Query() query: ListOrgTeamMembersQueryDto) {
    return this.orgTeam.listAllForAdmin(query);
  }

  @Get(':id/members')
  @ApiOperation({
    summary: 'List team members for a specific customer organization',
  })
  listOrgMembers(
    @Param('id') id: string,
    @Query() query: ListOrgTeamMembersQueryDto,
  ) {
    return this.orgTeam.listByOrgForAdmin(id, query);
  }

  @Get(':id')
  getById(@Param('id') id: string) {
    return this.service.getById(id);
  }

  @Patch(':id/status')
  updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateOrganizationStatusDto,
    @CurrentUser() actor: RequestUser,
  ) {
    return this.service.updateStatus(id, dto, actor);
  }

  @Patch(':id/subscription')
  changePlan(
    @Param('id') id: string,
    @Body() dto: ChangeOrganizationPlanDto,
    @CurrentUser() actor: RequestUser,
  ) {
    return this.service.changePlan(id, dto, actor);
  }
}
