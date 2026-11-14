import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { RawResponse } from '../../common/decorators/raw-response.decorator';
import { AiServiceSecretGuard } from '../../common/guards/ai-service-secret.guard';
import { BusinessMemoryService } from './business-memory.service';
import { RecallBusinessMemoryQueryDto } from './dto/recall-business-memory-query.dto';

/** Read-only recall for AI agents. Only ACTIVE (owner-approved) memories. */
@ApiTags('AI Internal')
@Controller('ai-internal/organizations/:organizationId')
@Public()
@UseGuards(AiServiceSecretGuard)
@ApiHeader({ name: 'x-ai-actions-secret', required: true })
export class AiBusinessMemoryController {
  constructor(private readonly memory: BusinessMemoryService) {}

  @Get('business-memory')
  @RawResponse()
  @ApiOperation({
    summary: 'Owner-approved business memories relevant to one chat turn',
  })
  recall(
    @Param('organizationId') organizationId: string,
    @Query() query: RecallBusinessMemoryQueryDto,
  ) {
    return this.memory.recall(organizationId, query);
  }
}
