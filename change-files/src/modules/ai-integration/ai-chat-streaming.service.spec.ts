import { ConfigService } from '@nestjs/config';
import { AiSourceContextService } from '../ai-internal/ai-source-context.service';
import { AgentActivityService } from '../ai-telemetry/agent-activity.service';
import { AiChatStreamingService } from './ai-chat-streaming.service';
import { AiChatTurnService } from './ai-chat-turn.service';
import { AiStreamingClient } from './ai-streaming.client';

describe('AiChatStreamingService', () => {
  const organizationId = 'org-1';
  const sourceMessageId = 'message-1';
  const prepared = {
    request: {
      schemaVersion: '1.0',
      turnId: 'chat-turn-message-1',
      idempotencyKey: 'chat-turn-message-1',
      organizationId,
      requester: {
        userId: 'user-1',
        name: 'Mahabur Rahman',
      },
      conversation: {
        id: 'conversation-1',
        title: 'Pipeline review',
        selectedAgent: {
          id: 'agent-1',
          name: 'Laura',
          type: 'CHIEF_OF_STAFF',
        },
      },
      message: {
        id: sourceMessageId,
        senderType: 'USER',
        content: 'Show the pipeline',
        createdAt: '2026-11-13T06:00:00.000Z',
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
        currentTime: '2026-11-13T06:00:00.000Z',
      },
    },
  };
  let turns: Record<string, jest.Mock>;
  let streaming: Record<string, jest.Mock>;
  let sourceContext: Record<string, jest.Mock>;
  let activity: Record<string, jest.Mock>;
  let service: AiChatStreamingService;
  const persistedResponse = {
    reply: {
      agent: { id: 'agent-1', name: 'Laura', type: 'CHIEF_OF_STAFF' },
    },
    result: { type: 'MESSAGE' },
  };

  beforeEach(() => {
    turns = {
      prepare: jest.fn().mockResolvedValue(prepared),
      complete: jest.fn().mockResolvedValue({
        response: persistedResponse,
        assistantMessageCreated: true,
      }),
    };
    streaming = { open: jest.fn() };
    sourceContext = {
      markMessageProcessed: jest.fn().mockResolvedValue(undefined),
    };
    activity = {
      start: jest.fn().mockResolvedValue('activity-1'),
      succeed: jest.fn().mockResolvedValue(undefined),
      fail: jest.fn().mockResolvedValue(undefined),
    };
    const config = {
      get: jest.fn((_key: string, fallback: unknown) => fallback),
    } as unknown as ConfigService;
    service = new AiChatStreamingService(
      turns as unknown as AiChatTurnService,
      streaming as unknown as AiStreamingClient,
      sourceContext as unknown as AiSourceContextService,
      activity as unknown as AgentActivityService,
      config,
    );
  });

  it('persists the structured result before emitting the terminal event', async () => {
    const rawResult = {
      schemaVersion: '1.0',
      turnId: prepared.request.turnId,
      conversationId: prepared.request.conversation.id,
      inReplyToMessageId: sourceMessageId,
      reply: {
        id: 'request-1',
        content: 'The pipeline is healthy.',
        agent: prepared.request.conversation.selectedAgent,
      },
      result: { type: 'MESSAGE' },
    };
    const response = new Response(
      'event: activity\ndata: {"stage":"planning"}\n\n' +
        `event: result\ndata: ${JSON.stringify(rawResult)}\n\n`,
      { status: 200, headers: { 'content-type': 'text/event-stream' } },
    );
    streaming.open.mockResolvedValue({ response, abort: jest.fn() });
    const opened = await service.open(
      organizationId,
      sourceMessageId,
      'Bearer access-token',
      new AbortController().signal,
    );
    const emitted: string[] = [];

    await expect(
      service.consume(opened, (event) => {
        if (event.startsWith('event: result')) {
          expect(turns.complete).toHaveBeenCalledTimes(1);
          expect(sourceContext.markMessageProcessed).toHaveBeenLastCalledWith(
            organizationId,
            sourceMessageId,
            'COMPLETED',
          );
        }
        emitted.push(event);
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        terminal: 'result',
        persisted: expect.anything(),
      }),
    );
    expect(emitted).toEqual([
      'event: activity\ndata: {"stage":"planning"}\n\n',
      `event: result\ndata: ${JSON.stringify(persistedResponse)}\n\n`,
    ]);
    expect(streaming.open).toHaveBeenCalledWith(
      '/api/v1/ai/chat',
      prepared.request,
      'Bearer access-token',
      expect.any(AbortSignal),
      [],
    );
    expect(turns.complete).toHaveBeenCalledWith(
      organizationId,
      sourceMessageId,
      prepared,
      rawResult,
    );
    expect(activity.succeed).toHaveBeenCalledWith(
      'activity-1',
      expect.objectContaining({
        metadata: expect.objectContaining({ transport: 'SSE' }),
      }),
    );
    expect(activity.fail).not.toHaveBeenCalled();
  });

  it('marks the source failed when AI terminates with an error event', async () => {
    const response = new Response(
      'event: error\ndata: {"status":503,"detail":"Model unavailable"}\n\n',
      { status: 200, headers: { 'content-type': 'text/event-stream' } },
    );
    streaming.open.mockResolvedValue({ response, abort: jest.fn() });
    const opened = await service.open(
      organizationId,
      sourceMessageId,
      'Bearer access-token',
      new AbortController().signal,
    );
    const emitted: string[] = [];

    await expect(
      service.consume(opened, (event) => {
        emitted.push(event);
      }),
    ).resolves.toEqual({ terminal: 'error' });
    expect(turns.complete).not.toHaveBeenCalled();
    expect(sourceContext.markMessageProcessed).toHaveBeenLastCalledWith(
      organizationId,
      sourceMessageId,
      'FAILED',
      'Model unavailable',
    );
    expect(activity.fail).toHaveBeenCalled();
    expect(emitted).toEqual([
      'event: error\ndata: {"status":503,"detail":"Model unavailable"}\n\n',
    ]);
  });

  it('records the contract error message from a structured error event', async () => {
    const raw =
      'event: error\ndata: {"code":"RATE_LIMITED","message":"The chat model is rate limited.","retryable":true}\n\n';
    const response = new Response(raw, {
      status: 200,
      headers: { 'content-type': 'text/event-stream' },
    });
    streaming.open.mockResolvedValue({ response, abort: jest.fn() });
    const opened = await service.open(
      organizationId,
      sourceMessageId,
      'Bearer access-token',
      new AbortController().signal,
    );
    const emitted: string[] = [];

    await expect(
      service.consume(opened, (event) => {
        emitted.push(event);
      }),
    ).resolves.toEqual({ terminal: 'error' });
    expect(sourceContext.markMessageProcessed).toHaveBeenLastCalledWith(
      organizationId,
      sourceMessageId,
      'FAILED',
      'The chat model is rate limited.',
    );
    expect(emitted).toEqual([raw]);
  });

  it('passes a structured clarification result through without adapting it', async () => {
    const rawResult = {
      schemaVersion: '1.0',
      turnId: prepared.request.turnId,
      conversationId: prepared.request.conversation.id,
      inReplyToMessageId: sourceMessageId,
      reply: {
        id: 'request-2',
        content: 'Which quarter should I review?',
        agent: prepared.request.conversation.selectedAgent,
      },
      result: {
        type: 'CLARIFICATION',
        draft: {
          id: 'draft-1',
          kind: 'TASK',
          payload: {},
        },
        questions: [
          {
            id: 'quarter',
            field: 'quarter',
            question: 'Which quarter should I review?',
            inputType: 'text',
            required: true,
          },
        ],
      },
    };
    const response = new Response(
      'event: result\ndata: ' + JSON.stringify(rawResult) + '\n\n',
      { status: 200, headers: { 'content-type': 'text/event-stream' } },
    );
    streaming.open.mockResolvedValue({ response, abort: jest.fn() });
    const opened = await service.open(
      organizationId,
      sourceMessageId,
      'Bearer access-token',
      new AbortController().signal,
    );

    await service.consume(opened, jest.fn());

    expect(turns.complete).toHaveBeenCalledWith(
      organizationId,
      sourceMessageId,
      prepared,
      rawResult,
    );
  });

  it('marks an opened stream failed when the frontend disconnects early', async () => {
    const abort = jest.fn();
    const response = new Response(
      'event: activity\ndata: {"stage":"planning"}\n\n',
      { status: 200, headers: { 'content-type': 'text/event-stream' } },
    );
    streaming.open.mockResolvedValue({ response, abort });
    const opened = await service.open(
      organizationId,
      sourceMessageId,
      'Bearer access-token',
      new AbortController().signal,
    );

    await service.cancel(opened, 'Client disconnected');

    expect(abort).toHaveBeenCalledTimes(1);
    expect(sourceContext.markMessageProcessed).toHaveBeenLastCalledWith(
      organizationId,
      sourceMessageId,
      'FAILED',
      'Client disconnected',
    );
    expect(activity.fail).toHaveBeenCalled();
  });
});
