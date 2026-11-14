import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/enums/user-role.enum';
import { OrganizationGuard } from '../../common/guards/organization.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { RequestUser } from '../../common/types/request-context.type';
import { CreateOrgTeamMemberDto } from './dto/create-org-team-member.dto';
import { ListOrgTeamMembersQueryDto } from './dto/list-org-team-members-query.dto';
import { UpdateOrgTeamMemberDto } from './dto/update-org-team-member.dto';
import { OrgTeamService } from './org-team.service';

@ApiTags('Organization Team (User Dashboard)')
@ApiBearerAuth()
@Controller('organization/team')
@UseGuards(OrganizationGuard)
export class OrgTeamController {
  constructor(private readonly service: OrgTeamService) {}

  @Get('permissions')
  @ApiOperation({
    summary: 'List available module permissions for User Dashboard sidebar tabs',
  })
  getPermissions() {
    return this.service.getAvailablePermissions();
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiOperation({
    summary:
      'Invite a new team member to the organization with assigned tab permissions',
  })
  invite(
    @CurrentUser() actor: RequestUser,
    @Body() dto: CreateOrgTeamMemberDto,
  ) {
    return this.service.invite(actor, dto);
  }

  @Get()
  @ApiOperation({
    summary: 'List team members in current user organization',
  })
  list(
    @CurrentUser() actor: RequestUser,
    @Query() query: ListOrgTeamMembersQueryDto,
  ) {
    return this.service.list(actor, query);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get details of a specific team member in the organization',
  })
  get(@CurrentUser() actor: RequestUser, @Param('id') id: string) {
    return this.service.getById(actor, id);
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiOperation({
    summary: 'Update role, module permissions, or status of a team member',
  })
  update(
    @CurrentUser() actor: RequestUser,
    @Param('id') id: string,
    @Body() dto: UpdateOrgTeamMemberDto,
  ) {
    return this.service.update(actor, id, dto);
  }

  @Post(':id/resend-invite')
  @UseGuards(RolesGuard)
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiOperation({
    summary:
      'Regenerate temporary password and resend invitation email to team member',
  })
  resendInvite(@CurrentUser() actor: RequestUser, @Param('id') id: string) {
    return this.service.resendInvite(actor, id);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiOperation({
    summary: 'Remove a team member from the organization',
  })
  remove(@CurrentUser() actor: RequestUser, @Param('id') id: string) {
    return this.service.remove(actor, id);
  }
}
