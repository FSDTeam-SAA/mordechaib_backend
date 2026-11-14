import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PlatformAdminGuard } from '../../common/guards/platform-admin.guard';
import { RequestUser } from '../../common/types/request-context.type';
import { ListOrgTeamMembersQueryDto } from '../org-team/dto/list-org-team-members-query.dto';
import { OrgTeamService } from '../org-team/org-team.service';
import { ChangeOrganizationPlanDto } from './dto/change-organization-plan.dto';
import { ListOrganizationPlanOptionsQueryDto } from './dto/list-organization-plan-options-query.dto';
import { ListOrganizationsAdminQueryDto } from './dto/list-organizations-admin-query.dto';
import { UpdateOrganizationStatusDto } from './dto/update-organization-status.dto';
import {
  AdminOrganizationDetailResponse,
  AdminOrganizationListResponse,
} from './admin-organization-response.types';
import { AdminOrganizationPlanOptionsResponse } from './organization-plan-options.types';
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
  @ApiOperation({
    summary: 'List and summarize customer organizations',
    description:
      'Returns organization rows, effective subscription presentation, pagination, and timezone-aware measured summary cards.',
  })
  @ApiOkResponse({ type: AdminOrganizationListResponse })
  @ApiBadRequestResponse({ description: 'Invalid or conflicting filters.' })
  @ApiForbiddenResponse({ description: 'Platform Admin access is required.' })
  list(@Query() query: ListOrganizationsAdminQueryDto) {
    return this.service.list(query);
  }

  @Get(':id/plan-options')
  @ApiOperation({
    summary: 'Get organization-aware Manage Plan options',
    description:
      'Returns the active dynamic plan catalog with the current plan, selected billing interval, and the exact UI action allowed for every plan.',
  })
  @ApiOkResponse({ type: AdminOrganizationPlanOptionsResponse })
  @ApiNotFoundResponse({ description: 'Organization not found.' })
  getPlanOptions(
    @Param('id') id: string,
    @Query() query: ListOrganizationPlanOptionsQueryDto,
  ) {
    return this.service.getPlanOptions(id, query);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get one organization management view',
    description:
      'Returns company details, owner, subscription, measured metrics, and a read-only organization-scoped connected-tools overview.',
  })
  @ApiOkResponse({ type: AdminOrganizationDetailResponse })
  @ApiNotFoundResponse({ description: 'Organization not found.' })
  @ApiForbiddenResponse({ description: 'Platform Admin access is required.' })
  getById(@Param('id') id: string) {
    return this.service.getById(id);
  }

  @Patch(':id/status')
  @ApiOperation({
    summary: 'Suspend or resume an organization',
    description:
      'Serializes organization mutations, records actual state changes in the audit log, and treats repeated target-state requests as idempotent success.',
  })
  @ApiOkResponse({ type: AdminOrganizationDetailResponse })
  @ApiNotFoundResponse({ description: 'Organization not found.' })
  @ApiConflictResponse({
    description: 'Another organization administration operation is running.',
  })
  @ApiForbiddenResponse({ description: 'Platform Admin access is required.' })
  updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateOrganizationStatusDto,
    @CurrentUser() actor: RequestUser,
  ) {
    return this.service.updateStatus(id, dto, actor);
  }

  @Patch(':id/subscription')
  @ApiOperation({
    summary: 'Switch an organization subscription plan',
    description:
      'Executes only SWITCH actions returned by plan-options. Provider mutations use distributed exclusion and deterministic Stripe idempotency.',
  })
  @ApiOkResponse({ type: AdminOrganizationDetailResponse })
  @ApiBadRequestResponse({
    description:
      'The plan is inquiry-only, the billing interval is unsupported, or the organization has no manageable Stripe subscription.',
  })
  @ApiNotFoundResponse({ description: 'Organization or plan not found.' })
  @ApiConflictResponse({
    description: 'Another organization administration operation is running.',
  })
  @ApiServiceUnavailableResponse({
    description:
      'Stripe accepted the change but local synchronization requires reconciliation.',
  })
  @ApiForbiddenResponse({ description: 'Platform Admin access is required.' })
  changePlan(
    @Param('id') id: string,
    @Body() dto: ChangeOrganizationPlanDto,
    @CurrentUser() actor: RequestUser,
  ) {
    return this.service.changePlan(id, dto, actor);
  }
}
