import { Injectable, NotFoundException } from '@nestjs/common';
import { AgentType } from '../../common/enums/agent-type.enum';
import {
  AiActionProposalStatus,
  AiActionType,
} from '../../database/schemas/ai-action-proposal.schema';
import { AiSourceContextService } from '../ai-internal/ai-source-context.service';
import { AiChatAgentResolver } from './ai-chat-agent-resolver.service';
import {
  AiChatClarificationQuestion,
  AiChatMessage,
  AiChatTurnRequest,
} from './ai-chat.types';

type SourceMessage = {
  id: string;
  senderType: 'USER' | 'AI' | 'SYSTEM';
  content?: string;
  extractedText?: string;
  transcription?: string;
  createdAt?: string | Date;
  sourceMessageId?: string;
  agentId?: string;
  agentName?: string;
  agentType?: string;
  agentImageUrl?: string;
};

type MessageSourceContext = {
  organizationId: string;
  requesterUserId?: string;
  conversationId: string;
  message: SourceMessage;
  conversation: {
    id: string;
    title: string;
    totalMessageCount: number;
    selectedAgentId?: string;
    history: SourceMessage[];
  };
  attachments?: Array<{
    messageId?: string;
    originalName?: string;
    extractedText?: string;
    transcription?: string;
  }>;
  pendingProposals?: Array<Record<string, unknown>>;
};

@Injectable()
export class AiChatContextService {
  constructor(
    private readonly sourceContext: AiSourceContextService,
    private readonly agents: AiChatAgentResolver,
  ) {}

  async build(
    organizationId: string,
    messageId: string,
  ): Promise<{ request: AiChatTurnRequest }> {
    const source = (await this.sourceContext.sourceContext(
      'USER_MESSAGE',
      messageId,
      organizationId,
    )) as unknown as MessageSourceContext;
    if (source.organizationId !== organizationId) {
      throw new NotFoundException('Message source not found');
    }
    const [organization, requester, selectedAgent] = await Promise.all([
      this.sourceContext.organizationContext(organizationId),
      this.sourceContext.requesterContext(
        organizationId,
        source.requesterUserId,
      ),
      this.agents.resolve(organizationId, source.conversation.selectedAgentId),
    ]);
    const effectiveTimezone = requester?.timezone || organization.timezone;
    const currentTime = this.iso(source.message.createdAt);
    const recentMessages = source.conversation.history.map((message) =>
      this.chatMessage(message, source.attachments),
    );
    const currentMessage = recentMessages.find(
      (message) => message.id === messageId,
    );
    if (!currentMessage || currentMessage.senderType !== 'USER') {
      throw new NotFoundException(
        'Current user message is missing from history',
      );
    }
    const oldest = recentMessages[0];
    const hasOlder =
      source.conversation.totalMessageCount > recentMessages.length;
    const cursor = hasOlder && oldest ? this.cursor(oldest.id) : null;
    const turnId = `chat-turn-${messageId}`;
    return {
      request: {
        schemaVersion: '1.0',
        turnId,
        idempotencyKey: turnId,
        organizationId,
        conversation: {
          id: source.conversation.id,
          title: source.conversation.title,
          selectedAgent,
        },
        message: { ...currentMessage, senderType: 'USER' },
        recentMessages,
        historyPage: {
          included: recentMessages.length,
          hasOlder,
          olderMessagesCursor: cursor,
          ...(cursor
            ? {
                olderMessagesPath:
                  `/api/v1/ai-internal/organizations/${organizationId}` +
                  `/conversations/${source.conversation.id}/messages` +
                  `?limit=50&cursor=${encodeURIComponent(cursor)}`,
              }
            : {}),
        },
        pendingDrafts: this.pendingDrafts(source.pendingProposals || []),
        context: {
          effectiveTimezone,
          language: requester?.language || organization.language || 'en',
          currentTime,
        },
      },
    };
  }

  private chatMessage(
    message: SourceMessage,
    attachments: MessageSourceContext['attachments'] = [],
  ): AiChatMessage {
    const content = this.messageContent(message, attachments);
    const hasAgent = message.agentId && message.agentName && message.agentType;
    return {
      id: message.id,
      senderType: message.senderType,
      content,
      createdAt: this.iso(message.createdAt),
      ...(message.sourceMessageId
        ? { sourceMessageId: message.sourceMessageId }
        : {}),
      ...(hasAgent
        ? {
            agent: {
              id: message.agentId!,
              name: message.agentName!,
              type: message.agentType as AgentType,
              ...(message.agentImageUrl
                ? { imageUrl: message.agentImageUrl }
                : {}),
            },
          }
        : {}),
    };
  }

  private messageContent(
    message: SourceMessage,
    attachments: MessageSourceContext['attachments'] = [],
  ) {
    const parts = [
      message.content,
      message.extractedText,
      message.transcription,
    ]
      .filter((value): value is string => Boolean(value?.trim()))
      .map((value) => value.trim());
    for (const attachment of attachments.filter(
      (item) => item.messageId === message.id,
    )) {
      const text = attachment.extractedText || attachment.transcription;
      if (text?.trim()) {
        parts.push(
          `${attachment.originalName || 'Attachment'}:\n${text.trim()}`,
        );
      } else if (attachment.originalName) {
        parts.push(`[Attached file: ${attachment.originalName}]`);
      }
    }
    return (parts.join('\n\n') || '[Message without readable text]').slice(
      0,
      20_000,
    );
  }

  private pendingDrafts(proposals: Array<Record<string, unknown>>) {
    return proposals
      .filter((proposal) =>
        [
          AiActionProposalStatus.NEEDS_CLARIFICATION,
          AiActionProposalStatus.PENDING,
        ].includes(proposal.status as AiActionProposalStatus),
      )
      .map((proposal) => ({
        id: String(proposal.chatDraftId || proposal.proposalId),
        kind:
          proposal.actionType === AiActionType.CREATE_TASK
            ? ('TASK' as const)
            : proposal.actionType === AiActionType.SCHEDULE_MEETING
              ? ('MEETING' as const)
              : ('CRM_RECORD_UPDATE' as const),
        status:
          proposal.status === AiActionProposalStatus.PENDING
            ? ('READY' as const)
            : ('NEEDS_CLARIFICATION' as const),
        revision: typeof proposal.revision === 'number' ? proposal.revision : 1,
        payload: this.record(proposal.payload),
        ...(Array.isArray(proposal.clarificationQuestions) &&
        proposal.clarificationQuestions.length
          ? {
              questions:
                proposal.clarificationQuestions as AiChatClarificationQuestion[],
            }
          : {}),
      }));
  }

  private record(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }

  private iso(value: string | Date | undefined) {
    const date = value ? new Date(value) : new Date(0);
    if (Number.isNaN(date.getTime())) return new Date(0).toISOString();
    return date.toISOString();
  }

  private cursor(messageId: string) {
    return Buffer.from(messageId, 'utf8').toString('base64url');
  }
}
