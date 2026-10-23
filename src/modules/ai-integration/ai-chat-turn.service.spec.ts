import { ConfigService } from '@nestjs/config';
import { AgentType } from '../../common/enums/agent-type.enum';
import { AiActionType } from '../../database/schemas/ai-action-proposal.schema';
import { AiActionsService } from '../ai-actions/ai-actions.service';
import { AiChatContextService } from './ai-chat-context.service';
import { AiChatReplyService } from './ai-chat-reply.service';
import { AiChatResponseValidator } from './ai-chat-response.validator';
import { AiChatTurnService } from './ai-chat-turn.service';
import { AiServiceClient } from './ai-service.client';

describe('AiChatTurnService', () => {
  const organizationId = 'organization-1';
  const messageId = 'message-1';
  const agent = {
    id: '66cc9bdfa847ea856c7b41a1',
    name: 'Laura',
    type: AgentType.CHIEF_OF_STAFF,
  };
  const request = {
    schemaVersion: '1.0' as const,
    turnId: 'chat-turn-message-1',
    idempotencyKey: 'chat-turn-message-1',
    organizationId,
    conversation: {
      id: 'conversation-1',
      title: 'New Chat',
      selectedAgent: agent,
    },
    message: {
      id: messageId,
      senderType: 'USER' as const,
      content: 'Create a high priority follow-up task',
      createdAt: '2026-10-20T03:00:00.000Z',
    },
    recentMessages: [],
    historyPage: {
      included: 0,
      hasOlder: false,
      olderMessagesCursor: null,
    },
    pendingDrafts: [],
    context: {
      effectiveTimezone: 'Asia/Dhaka',
      language: 'en',
      currentTime: '2026-10-20T03:00:00.000Z',
    },
  };
  const context = { build: jest.fn() };
  const aiService = { request: jest.fn() };
  const validator = { validate: jest.fn() };
  const replies = { persist: jest.fn() };
  const actions = { ingestChatDraft: jest.fn() };
  let service: AiChatTurnService;

  beforeEach(() => {
    jest.resetAllMocks();
    context.build.mockResolvedValue({ request });
    aiService.request.mockResolvedValue({ raw: true });
    validator.validate.mockReturnValue({
      schemaVersion: '1.0',
      turnId: request.turnId,
      conversationId: request.conversation.id,
      inReplyToMessageId: messageId,
      reply: { id: 'reply-1', content: 'Ready for review.', agent },
      result: {
        type: 'TASK_PROPOSAL',
        draftId: 'task-1',
        proposal: { title: 'Follow up', priority: 'HIGH' },
      },
    });
    actions.ingestChatDraft.mockResolvedValue({ id: 'proposal-1' });
    replies.persist.mockResolvedValue({
      created: true,
      message: { _id: 'ai-message-1' },
    });
    service = new AiChatTurnService(
      context as unknown as AiChatContextService,
      aiService as unknown as AiServiceClient,
      validator as unknown as AiChatResponseValidator,
      replies as unknown as AiChatReplyService,
      actions as unknown as AiActionsService,
      { get: jest.fn().mockReturnValue(45_000) } as unknown as ConfigService,
    );
  });

  it('persists a validated task draft and its AI reply', async () => {
    await expect(service.process(organizationId, messageId)).resolves.toEqual(
      expect.objectContaining({
        proposal: { id: 'proposal-1' },
        assistantMessageId: 'ai-message-1',
      }),
    );
    expect(aiService.request).toHaveBeenCalledWith('/api/v1/ai/chat', request, {
      timeoutMs: 45_000,
    });
    expect(actions.ingestChatDraft).toHaveBeenCalledWith(
      organizationId,
      expect.objectContaining({
        draftId: 'task-1',
        actionType: AiActionType.CREATE_TASK,
      }),
    );
    expect(replies.persist).toHaveBeenCalledWith(
      expect.objectContaining({ sourceMessageId: messageId }),
    );
  });

  it('sends every queued user message to the dedicated AI chat route', async () => {
    await service.process(organizationId, messageId);

    expect(aiService.request).toHaveBeenCalledTimes(1);
  });

  it('maps a CRM chat result into the shared approval lifecycle', async () => {
    validator.validate.mockReturnValue({
      schemaVersion: '1.0',
      turnId: request.turnId,
      conversationId: request.conversation.id,
      inReplyToMessageId: messageId,
      reply: { id: 'reply-crm-1', content: 'Ready for review.', agent },
      result: {
        type: 'CRM_RECORD_UPDATE_PROPOSAL',
        draftId: 'crm-product-1',
        proposal: {
          provider: 'HUBSPOT',
          objectType: 'products',
          externalId: '123',
          properties: { price: 125 },
        },
      },
    });

    await service.process(organizationId, messageId);

    expect(actions.ingestChatDraft).toHaveBeenCalledWith(
      organizationId,
      expect.objectContaining({
        draftId: 'crm-product-1',
        actionType: AiActionType.UPDATE_CRM_RECORD,
      }),
    );
  });
});
