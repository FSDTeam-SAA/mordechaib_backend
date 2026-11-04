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
      turnId: 'chat-turn-message-1',
      conversation: { id: 'conversation-1' },
      message: { id: sourceMessageId },
    },
  };
  let turns: Record<string, jest.Mock>;
  let streaming: Record<string, jest.Mock>;
  let sourceContext: Record<string, jest.Mock>;
  let activity: Record<string, jest.Mock>;
  let service: AiChatStreamingService;

  beforeEach(() => {
    turns = {
      prepare: jest.fn().mockResolvedValue(prepared),
      complete: jest.fn().mockResolvedValue({
        response: {
          reply: {
            agent: { id: 'agent-1', name: 'Laura', type: 'CHIEF_OF_STAFF' },
          },
          result: { type: 'MEETING_PROPOSAL' },
        },
        proposal: { id: 'proposal-1' },
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
      turnId: 'chat-turn-message-1',
      result: { type: 'MEETING_PROPOSAL' },
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
      `event: result\ndata: ${JSON.stringify(rawResult)}\n\n`,
    ]);
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
