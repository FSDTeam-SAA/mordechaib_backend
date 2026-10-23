import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { RawResponse } from '../../common/decorators/raw-response.decorator';
import { AiServiceSecretGuard } from '../../common/guards/ai-service-secret.guard';
import { AiChatHistoryService } from './ai-chat-history.service';
import { ListAiChatHistoryQueryDto } from './dto/list-ai-chat-history-query.dto';

@ApiTags('AI Internal')
@Controller(
  'ai-internal/organizations/:organizationId/conversations/:conversationId/messages',
)
@Public()
@UseGuards(AiServiceSecretGuard)
export class AiChatHistoryController {
  constructor(private readonly history: AiChatHistoryService) {}

  @Get()
  @RawResponse()
  @ApiHeader({ name: 'x-ai-actions-secret', required: true })
  @ApiOperation({ summary: 'Get one bounded page of older AI chat history' })
  list(
    @Param('organizationId') organizationId: string,
    @Param('conversationId') conversationId: string,
    @Query() query: ListAiChatHistoryQueryDto,
  ) {
    return this.history.list(
      organizationId,
      conversationId,
      query.limit,
      query.cursor,
    );
  }
}
