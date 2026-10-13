import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
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
import { AgentWorkforceService } from './agent-workforce.service';
import { GetAgentWorkforceQueryDto } from './dto/get-agent-workforce-query.dto';
import { UpdateOrganizationAgentSettingDto } from './dto/update-organization-agent-setting.dto';

@ApiTags('AI Agent Workforce')
@ApiBearerAuth()
@Controller('agent-workforce')
@UseGuards(OrganizationGuard, RolesGuard)
@Roles(UserRole.OWNER, UserRole.ADMIN)
export class AgentWorkforceController {
  constructor(private readonly workforce: AgentWorkforceService) {}

  @Get('dashboard')
  @Header('Cache-Control', 'private, max-age=15')
  @ApiOperation({
    summary: 'Get measured per-agent performance and configured capacity',
  })
  dashboard(
    @CurrentOrg() organization: RequestOrganization,
    @Query() query: GetAgentWorkforceQueryDto,
  ) {
    return this.workforce.dashboard(organization.id, query);
  }

  @Get('settings')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'List organization-specific AI agent settings' })
  listSettings(@CurrentOrg() organization: RequestOrganization) {
    return this.workforce.listSettings(organization.id);
  }

  @Patch('settings/:agentId')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary: 'Update activation, approval, and capacity for one AI agent',
  })
  updateSetting(
    @CurrentOrg() organization: RequestOrganization,
    @CurrentUser() user: RequestUser,
    @Param('agentId') agentId: string,
    @Body() input: UpdateOrganizationAgentSettingDto,
  ) {
    return this.workforce.updateSetting(
      organization.id,
      user.id,
      agentId,
      input,
    );
  }
}
