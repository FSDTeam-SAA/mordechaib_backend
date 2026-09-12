import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PlatformAdminGuard } from '../../common/guards/platform-admin.guard';
import { RequestUser } from '../../common/types/request-context.type';
import { AgentStatus } from '../../common/enums/agent-status.enum';
import { AgentsService } from './agents.service';
import { CreateAgentDto } from './dto/create-agent.dto';
import { ListAgentsQueryDto } from './dto/list-agents-query.dto';
import { UpdateAgentDto } from './dto/update-agent.dto';

@ApiTags('Agents')
@ApiBearerAuth()
@Controller('agents')
export class AgentsController {
  constructor(private readonly agents: AgentsService) {}

  @Post()
  @UseGuards(PlatformAdminGuard)
  @ApiOperation({ summary: 'Create a platform AI agent profile' })
  create(@Body() dto: CreateAgentDto) {
    return this.agents.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'List platform AI agent profiles' })
  list(@CurrentUser() actor: RequestUser, @Query() query: ListAgentsQueryDto) {
    if (!actor.isPlatformAdmin) {
      if (query.status && query.status !== AgentStatus.ACTIVE) {
        throw new ForbiddenException(
          'Only platform admins can view disabled agents',
        );
      }
      query.status = AgentStatus.ACTIVE;
    }
    return this.agents.list(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one platform AI agent profile' })
  get(@CurrentUser() actor: RequestUser, @Param('id') id: string) {
    return this.agents.get(id, actor.isPlatformAdmin);
  }

  @Patch(':id')
  @UseGuards(PlatformAdminGuard)
  @ApiOperation({ summary: 'Update a platform AI agent profile' })
  update(@Param('id') id: string, @Body() dto: UpdateAgentDto) {
    return this.agents.update(id, dto);
  }

  @Delete(':id')
  @UseGuards(PlatformAdminGuard)
  @ApiOperation({ summary: 'Disable a platform AI agent profile' })
  remove(@Param('id') id: string) {
    return this.agents.remove(id);
  }
}
