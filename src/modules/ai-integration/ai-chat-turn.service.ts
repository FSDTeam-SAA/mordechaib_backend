import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AiActionType,
  AiProposalSourceType,
} from '../../database/schemas/ai-action-proposal.schema';
import { AiActionsService } from '../ai-actions/ai-actions.service';
import { AiChatContextService } from './ai-chat-context.service';
import { AiChatReplyService } from './ai-chat-reply.service';
import { AiChatResponseValidator } from './ai-chat-response.validator';
import { AiServiceClient } from './ai-service.client';
import { AiChatTurnRequest } from './ai-chat.types';

export type PreparedAiChatTurn = { request: AiChatTurnRequest };

@Injectable()
export class AiChatTurnService {
  constructor(
    private readonly context: AiChatContextService,
    private readonly aiService: AiServiceClient,
    private readonly validator: AiChatResponseValidator,
    private readonly replies: AiChatReplyService,
    private readonly actions: AiActionsService,
    private readonly config: ConfigService,
  ) {}

  async process(organizationId: string, sourceMessageId: string) {
    const prepared = await this.prepare(organizationId, sourceMessageId);
    const raw = await this.aiService.request<unknown>(
      '/api/v1/ai/chat',
      prepared.request as unknown as Record<string, unknown>,
      {
        timeoutMs: this.config.get<number>('aiService.chatTimeoutMs', 45_000),
      },
    );
    return this.complete(organizationId, sourceMessageId, prepared, raw);
  }

  prepare(
    organizationId: string,
    sourceMessageId: string,
  ): Promise<PreparedAiChatTurn> {
    return this.context.build(organizationId, sourceMessageId);
  }

  async complete(
    organizationId: string,
    sourceMessageId: string,
    prepared: PreparedAiChatTurn,
    raw: unknown,
  ) {
    const response = this.validator.validate(raw, prepared.request);
    const result = response.result;
    let proposal: Record<string, unknown> | undefined;
    if (result.type !== 'MESSAGE') {
      const clarification = result.type === 'CLARIFICATION';
      const draftId = clarification ? result.draft.id : result.draftId;
      const kind = clarification
        ? result.draft.kind
        : result.type === 'TASK_PROPOSAL'
          ? 'TASK'
          : result.type === 'MEETING_PROPOSAL'
            ? 'MEETING'
            : 'CRM_RECORD_UPDATE';
      const payload = clarification ? result.draft.payload : result.proposal;
      proposal = await this.actions.ingestChatDraft(organizationId, {
        conversationId: prepared.request.conversation.id,
        draftId,
        sourceMessageId,
        actionType:
          kind === 'TASK'
            ? AiActionType.CREATE_TASK
            : kind === 'MEETING'
              ? AiActionType.SCHEDULE_MEETING
              : AiActionType.UPDATE_CRM_RECORD,
        proposedByAgent: response.reply.agent,
        payload,
        ...(clarification ? { clarificationQuestions: result.questions } : {}),
        evidenceText: prepared.request.message.content,
        effectiveTimezone: prepared.request.context.effectiveTimezone,
      });
    }
    const assistantReply = await this.replies.persist({
      organizationId,
      conversationId: prepared.request.conversation.id,
      sourceMessageId,
      assistantMessage: {
        responseId: response.reply.id,
        content: response.reply.content,
        agent: response.reply.agent,
      },
    });
    return {
      source: { type: AiProposalSourceType.USER_MESSAGE, id: sourceMessageId },
      response,
      ...(proposal ? { proposal } : {}),
      assistantMessageId: String(assistantReply.message._id),
      assistantMessageCreated: assistantReply.created,
    };
  }
}
