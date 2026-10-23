import { BadRequestException } from '@nestjs/common';
import { AgentType } from '../../common/enums/agent-type.enum';
import { AiChatResponseValidator } from './ai-chat-response.validator';
import { AiChatTurnRequest } from './ai-chat.types';

describe('AiChatResponseValidator', () => {
  const agent = {
    id: '66cc9bdfa847ea856c7b41a1',
    name: 'Laura',
    type: AgentType.CHIEF_OF_STAFF,
  };
  const request: AiChatTurnRequest = {
    schemaVersion: '1.0',
    turnId: 'chat-turn-message-1',
    idempotencyKey: 'chat-turn-message-1',
    organizationId: 'organization-1',
    conversation: {
      id: 'conversation-1',
      title: 'New Chat',
      selectedAgent: agent,
    },
    message: {
      id: 'message-1',
      senderType: 'USER',
      content: 'Schedule a meeting',
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
  const validator = new AiChatResponseValidator();

  it('accepts a grounded meeting clarification response', () => {
    const result = validator.validate(
      {
        schemaVersion: '1.0',
        turnId: request.turnId,
        conversationId: request.conversation.id,
        inReplyToMessageId: request.message.id,
        reply: { id: 'reply-1', content: 'What time?', agent },
        result: {
          type: 'CLARIFICATION',
          draft: {
            id: 'meeting-1',
            kind: 'MEETING',
            payload: { title: 'Customer meeting' },
          },
          questions: [
            {
              id: 'meeting-time',
              field: 'startsAt',
              question: 'What time should it start?',
              inputType: 'datetime',
              required: true,
            },
          ],
        },
      },
      request,
    );

    expect(result.result.type).toBe('CLARIFICATION');
  });

  it('accepts a structured CRM record update proposal', () => {
    const result = validator.validate(
      {
        schemaVersion: '1.0',
        turnId: request.turnId,
        conversationId: request.conversation.id,
        inReplyToMessageId: request.message.id,
        reply: {
          id: 'reply-crm-1',
          content: 'The CRM update is ready for review.',
          agent,
        },
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
      },
      request,
    );

    expect(result.result.type).toBe('CRM_RECORD_UPDATE_PROPOSAL');
  });

  it('rejects a response for a different conversation', () => {
    expect(() =>
      validator.validate(
        {
          schemaVersion: '1.0',
          turnId: request.turnId,
          conversationId: 'other-conversation',
          inReplyToMessageId: request.message.id,
          reply: { id: 'reply-1', content: 'Hello', agent },
          result: { type: 'MESSAGE' },
        },
        request,
      ),
    ).toThrow(BadRequestException);
  });

  it('rejects a reply attributed to a different agent', () => {
    expect(() =>
      validator.validate(
        {
          schemaVersion: '1.0',
          turnId: request.turnId,
          conversationId: request.conversation.id,
          inReplyToMessageId: request.message.id,
          reply: {
            id: 'reply-1',
            content: 'Hello',
            agent: { ...agent, id: 'different-agent' },
          },
          result: { type: 'MESSAGE' },
        },
        request,
      ),
    ).toThrow(BadRequestException);
  });
});
