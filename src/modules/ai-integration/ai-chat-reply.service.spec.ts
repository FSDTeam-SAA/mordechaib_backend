import { BadRequestException } from '@nestjs/common';
import { Model } from 'mongoose';
import { AgentType } from '../../common/enums/agent-type.enum';
import { Conversation } from '../../database/schemas/conversation.schema';
import { Message } from '../../database/schemas/message.schema';
import { AiChatReplyService } from './ai-chat-reply.service';
import { EmailDraftsService } from '../email/email-drafts.service';

describe('AiChatReplyService', () => {
  const organizationId = 'org-1';
  const conversationId = 'conversation-1';
  const sourceMessageId = '507f1f77bcf86cd799439011';
  const aiMessageId = '507f1f77bcf86cd799439012';
  const input = {
    organizationId,
    conversationId,
    sourceMessageId,
    assistantMessage: {
      responseId: 'source-user_message-1:reply:v1',
      content: 'Here is the result.',
      agent: {
        id: '507f1f77bcf86cd799439013',
        name: 'Laura',
        type: AgentType.CHIEF_OF_STAFF,
        imageUrl: 'https://cdn.example.com/laura.png',
      },
      runId: 'run-1',
    },
  };

  let messages: { findOne: jest.Mock; create: jest.Mock; updateOne: jest.Mock };
  let conversations: { findOne: jest.Mock; findOneAndUpdate: jest.Mock };
  let emailDrafts: { ensureFromAiReply: jest.Mock };
  let service: AiChatReplyService;

  beforeEach(() => {
    messages = {
      findOne: jest.fn(),
      create: jest.fn(),
      updateOne: jest
        .fn()
        .mockReturnValue({ exec: jest.fn().mockResolvedValue({}) }),
    };
    conversations = { findOne: jest.fn(), findOneAndUpdate: jest.fn() };
    emailDrafts = { ensureFromAiReply: jest.fn() };
    service = new AiChatReplyService(
      messages as unknown as Model<Message>,
      conversations as unknown as Model<Conversation>,
      emailDrafts as unknown as EmailDraftsService,
    );
  });

  it('stores a new AI reply and increments the conversation once', async () => {
    messages.findOne
      .mockReturnValueOnce(queryResult({ _id: sourceMessageId }))
      .mockReturnValueOnce(queryResult(null));
    conversations.findOne.mockReturnValue(queryResult({ _id: conversationId }));
    messages.create.mockResolvedValue({
      toObject: () => ({
        _id: aiMessageId,
        organizationId,
        conversationId,
        sourceMessageId,
        aiResponseId: input.assistantMessage.responseId,
        content: input.assistantMessage.content,
        agentId: input.assistantMessage.agent.id,
        agentName: input.assistantMessage.agent.name,
        agentType: input.assistantMessage.agent.type,
        agentImageUrl: input.assistantMessage.agent.imageUrl,
        agentRunId: input.assistantMessage.runId,
        createdAt: new Date('2026-09-18T00:00:00.000Z'),
      }),
    });
    conversations.findOneAndUpdate.mockReturnValue(
      queryResult({ _id: conversationId, totalMessageCount: 2 }),
    );

    await expect(service.persist(input)).resolves.toEqual({
      message: expect.objectContaining({ _id: aiMessageId }),
      created: true,
    });
    expect(messages.create).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceMessageId,
        aiResponseId: input.assistantMessage.responseId,
        content: input.assistantMessage.content,
        agentType: input.assistantMessage.agent.type,
        agentImageUrl: input.assistantMessage.agent.imageUrl,
      }),
    );
    expect(conversations.findOneAndUpdate).toHaveBeenCalledTimes(1);
  });

  it('returns an identical existing reply without incrementing again', async () => {
    const existing = {
      _id: aiMessageId,
      conversationId,
      sourceMessageId,
      content: input.assistantMessage.content,
      agentId: input.assistantMessage.agent.id,
      agentName: input.assistantMessage.agent.name,
      agentType: input.assistantMessage.agent.type,
      agentImageUrl: input.assistantMessage.agent.imageUrl,
      agentRunId: input.assistantMessage.runId,
    };
    messages.findOne
      .mockReturnValueOnce(queryResult({ _id: sourceMessageId }))
      .mockReturnValueOnce(queryResult(existing));
    conversations.findOne.mockReturnValue(queryResult({ _id: conversationId }));

    await expect(service.persist(input)).resolves.toEqual({
      message: existing,
      created: false,
    });
    expect(messages.create).not.toHaveBeenCalled();
    expect(conversations.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('links an AI email suggestion to an idempotent platform draft', async () => {
    const emailInput = {
      ...input,
      assistantMessage: {
        ...input.assistantMessage,
        emailDraft: {
          to: ['client@example.com'],
          subject: 'Project quotation',
          body: 'Please review the quotation.',
        },
      },
    };
    const existing = {
      _id: aiMessageId,
      conversationId,
      sourceMessageId,
      content: input.assistantMessage.content,
      agentId: input.assistantMessage.agent.id,
      agentName: input.assistantMessage.agent.name,
      agentRunId: input.assistantMessage.runId,
    };
    messages.findOne
      .mockReturnValueOnce(
        queryResult({ _id: sourceMessageId, senderId: 'owner-1' }),
      )
      .mockReturnValueOnce(queryResult(existing));
    conversations.findOne.mockReturnValue(queryResult({ _id: conversationId }));
    emailDrafts.ensureFromAiReply.mockResolvedValue({ id: 'draft-1' });

    const result = await service.persist(emailInput);

    expect(emailDrafts.ensureFromAiReply).toHaveBeenCalledWith({
      organizationId,
      userId: 'owner-1',
      conversationId,
      sourceMessageId,
      aiResponseId: input.assistantMessage.responseId,
      draft: emailInput.assistantMessage.emailDraft,
    });
    expect(messages.updateOne).toHaveBeenCalledWith(
      { _id: aiMessageId, organizationId },
      { $set: { emailDraftId: 'draft-1' } },
    );
    expect(result.message.emailDraftId).toBe('draft-1');
  });

  it('rejects reuse of a response id with different content', async () => {
    messages.findOne
      .mockReturnValueOnce(queryResult({ _id: sourceMessageId }))
      .mockReturnValueOnce(
        queryResult({
          conversationId,
          sourceMessageId,
          content: 'Different content',
          agentId: input.assistantMessage.agent.id,
          agentName: input.assistantMessage.agent.name,
          agentRunId: input.assistantMessage.runId,
        }),
      );
    conversations.findOne.mockReturnValue(queryResult({ _id: conversationId }));

    await expect(service.persist(input)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  function queryResult(value: unknown) {
    return { lean: () => ({ exec: () => Promise.resolve(value) }) };
  }
});
