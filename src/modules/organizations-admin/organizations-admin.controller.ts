import { Body, Controller, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PlatformAdminGuard } from '../../common/guards/platform-admin.guard';
import { RequestUser } from '../../common/types/request-context.type';
import { ChangeOrganizationPlanDto } from './dto/change-organization-plan.dto';
import { ListOrganizationsAdminQueryDto } from './dto/list-organizations-admin-query.dto';
import { UpdateOrganizationStatusDto } from './dto/update-organization-status.dto';
import { OrganizationsAdminService } from './organizations-admin.service';

@ApiTags('Organizations (platform admin)')
@ApiBearerAuth()
@Controller('organizations-admin')
@UseGuards(PlatformAdminGuard)
export class OrganizationsAdminController {
  constructor(private readonly service: OrganizationsAdminService) {}

  @Get()
  list(@Query() query: ListOrganizationsAdminQueryDto) {
    return this.service.list(query);
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
