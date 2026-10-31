import { BadGatewayException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AgentOperationType } from '../../common/enums/agent-activity.enum';
import { AiProposalSourceType } from '../../database/schemas/ai-action-proposal.schema';
import { AiSourceContextService } from '../ai-internal/ai-source-context.service';
import { AgentActivityService } from '../ai-telemetry/agent-activity.service';
import { AiChatTurnService, PreparedAiChatTurn } from './ai-chat-turn.service';
import { AiStreamHandle, AiStreamingClient } from './ai-streaming.client';
import { AiStreamAttachment } from './ai-stream-attachment';
import { ParsedSseEvent, SseEventParser } from './sse-event.parser';

export type OpenedAiChatStream = {
  organizationId: string;
  sourceMessageId: string;
  prepared: PreparedAiChatTurn;
  response: Response;
  abort: () => void;
  activityId?: string;
  settled: boolean;
};

export type AiChatStreamCompletion = {
  terminal: 'result' | 'error';
  persisted?: Awaited<ReturnType<AiChatTurnService['complete']>>;
};

@Injectable()
export class AiChatStreamingService {
  constructor(
    private readonly turns: AiChatTurnService,
    private readonly streaming: AiStreamingClient,
    private readonly sourceContext: AiSourceContextService,
    private readonly activity: AgentActivityService,
    private readonly config: ConfigService,
  ) {}

  async open(
    organizationId: string,
    sourceMessageId: string,
    signal: AbortSignal,
    attachments: AiStreamAttachment[] = [],
  ): Promise<OpenedAiChatStream> {
    await this.sourceContext.markMessageProcessed(
      organizationId,
      sourceMessageId,
      'PROCESSING',
    );
    const activityId = await this.activity.start({
      organizationId,
      operationType: AgentOperationType.SOURCE_ANALYSIS,
      jobId: `chat-stream-${organizationId}-${sourceMessageId}`,
      attempt: 1,
      sourceType: AiProposalSourceType.USER_MESSAGE,
      sourceId: sourceMessageId,
      metadata: { transport: 'SSE' },
    });
    try {
      const prepared = await this.turns.prepare(
        organizationId,
        sourceMessageId,
      );
      const handle: AiStreamHandle = await this.streaming.open(
        this.config.get<string>('aiService.chatStreamPath', '/api/v1/ai/chat'),
        prepared.request as unknown as Record<string, unknown>,
        signal,
        attachments,
      );
      return {
        organizationId,
        sourceMessageId,
        prepared,
        response: handle.response,
        abort: handle.abort,
        activityId,
        settled: false,
      };
    } catch (error) {
      await this.failMessage(
        organizationId,
        sourceMessageId,
        activityId,
        error,
      );
      throw error;
    }
  }

  async reject(opened: OpenedAiChatStream, status: number) {
    if (opened.settled) return;
    opened.settled = true;
    await this.failMessage(
      opened.organizationId,
      opened.sourceMessageId,
      opened.activityId,
      new Error(`AI chat stream was rejected with status ${status}`),
    );
  }

  async cancel(
    opened: OpenedAiChatStream,
    reason = 'AI chat stream was cancelled before completion',
  ) {
    opened.abort();
    await this.failOpened(opened, new Error(reason));
  }

  async consume(
    opened: OpenedAiChatStream,
    emit: (rawEvent: string) => void | Promise<void>,
  ): Promise<AiChatStreamCompletion> {
    const body = opened.response.body;
    if (!body) {
      const error = new BadGatewayException(
        'AI chat stream returned an empty response body',
      );
      await this.failOpened(opened, error);
      throw error;
    }

    const reader = body.getReader();
    const decoder = new TextDecoder();
    const parser = new SseEventParser();
    try {
      for (;;) {
        const { done, value } = await reader.read();
        const events = done
          ? [...parser.push(decoder.decode()), ...parser.finish()]
          : parser.push(decoder.decode(value, { stream: true }));
        for (const event of events) {
          const completion = await this.handleEvent(opened, event, emit);
          if (completion) return completion;
        }
        if (done) break;
      }
      const error = new BadGatewayException(
        'AI chat stream ended without a result or error event',
      );
      await this.failOpened(opened, error);
      throw error;
    } catch (error) {
      await this.failOpened(opened, error);
      throw error;
    } finally {
      reader.releaseLock();
    }
  }

  private async handleEvent(
    opened: OpenedAiChatStream,
    event: ParsedSseEvent,
    emit: (rawEvent: string) => void | Promise<void>,
  ): Promise<AiChatStreamCompletion | undefined> {
    if (event.event === 'result') {
      if (!event.data) {
        throw new BadGatewayException('AI result event did not contain data');
      }
      let raw: unknown;
      try {
        raw = JSON.parse(event.data) as unknown;
      } catch {
        throw new BadGatewayException('AI result event was not valid JSON');
      }
      const persisted = await this.turns.complete(
        opened.organizationId,
        opened.sourceMessageId,
        opened.prepared,
        raw,
      );
      await this.sourceContext.markMessageProcessed(
        opened.organizationId,
        opened.sourceMessageId,
        'COMPLETED',
      );
      await this.activity.succeed(opened.activityId, {
        agent: persisted.response.reply.agent,
        metadata: {
          transport: 'SSE',
          resultType: persisted.response.result.type,
          proposalCreated: Boolean(persisted.proposal),
          assistantMessageCreated: persisted.assistantMessageCreated,
        },
      });
      opened.settled = true;
      await emit(event.raw);
      return { terminal: 'result', persisted };
    }
    if (event.event === 'error') {
      await this.failOpened(
        opened,
        new Error(this.errorDetail(event.data) || 'AI chat stream failed'),
      );
      await emit(event.raw);
      return { terminal: 'error' };
    }
    await emit(event.raw);
    return undefined;
  }

  private async failOpened(opened: OpenedAiChatStream, error: unknown) {
    if (opened.settled) return;
    opened.settled = true;
    await this.failMessage(
      opened.organizationId,
      opened.sourceMessageId,
      opened.activityId,
      error,
    );
  }

  private async failMessage(
    organizationId: string,
    sourceMessageId: string,
    activityId: string | undefined,
    error: unknown,
  ) {
    const message =
      error instanceof Error ? error.message : 'AI chat stream failed';
    await this.sourceContext
      .markMessageProcessed(organizationId, sourceMessageId, 'FAILED', message)
      .catch(() => undefined);
    await this.activity.fail(activityId, {
      failureCode: 'AI_CHAT_STREAM_FAILED',
      failureMessage: message,
      metadata: { transport: 'SSE' },
    });
  }

  private errorDetail(data: string | undefined) {
    if (!data) return undefined;
    try {
      const parsed = JSON.parse(data) as { detail?: unknown };
      return typeof parsed.detail === 'string' ? parsed.detail : undefined;
    } catch {
      return undefined;
    }
  }
}
