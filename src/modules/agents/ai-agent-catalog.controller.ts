import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { AgentsService } from './agents.service';
import { ListAgentCatalogQueryDto } from './dto/list-agent-catalog-query.dto';
import { AiServiceSecretGuard } from './guards/ai-service-secret.guard';

@ApiTags('AI Internal')
@Controller('ai-internal/agents')
@Public()
@UseGuards(AiServiceSecretGuard)
export class AiAgentCatalogController {
  constructor(private readonly agents: AgentsService) {}

  @Get()
  @ApiHeader({
    name: 'x-ai-actions-secret',
    required: true,
    description: 'Shared Main Backend/AI Backend service secret',
  })
  @ApiOperation({ summary: 'Get the paginated agent synchronization catalog' })
  list(@Query() query: ListAgentCatalogQueryDto) {
    return this.agents.listCatalog(query);
  }
}
