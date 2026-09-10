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
import { CurrentOrg } from '../../common/decorators/current-org.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/enums/user-role.enum';
import { OrganizationGuard } from '../../common/guards/organization.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { RequestOrganization } from '../../common/types/request-context.type';
import { AgentsService } from './agents.service';
import { CreateAgentDto } from './dto/create-agent.dto';
import { ListAgentsQueryDto } from './dto/list-agents-query.dto';
import { UpdateAgentDto } from './dto/update-agent.dto';

@ApiTags('Agents')
@ApiBearerAuth()
@Controller('agents')
@UseGuards(OrganizationGuard)
export class AgentsController {
  constructor(private readonly agents: AgentsService) {}

  @Post()
  @UseGuards(RolesGuard)
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Create an organization AI agent profile' })
  create(
    @CurrentOrg() organization: RequestOrganization,
    @Body() dto: CreateAgentDto,
  ) {
    return this.agents.create(organization.id, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List organization AI agent profiles' })
  list(
    @CurrentOrg() organization: RequestOrganization,
    @Query() query: ListAgentsQueryDto,
  ) {
    return this.agents.list(organization.id, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one organization AI agent profile' })
  get(@CurrentOrg() organization: RequestOrganization, @Param('id') id: string) {
    return this.agents.get(organization.id, id);
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Update an organization AI agent profile' })
  update(
    @CurrentOrg() organization: RequestOrganization,
    @Param('id') id: string,
    @Body() dto: UpdateAgentDto,
  ) {
    return this.agents.update(organization.id, id, dto);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Delete an organization AI agent profile' })
  remove(@CurrentOrg() organization: RequestOrganization, @Param('id') id: string) {
    return this.agents.remove(organization.id, id);
  }
}
