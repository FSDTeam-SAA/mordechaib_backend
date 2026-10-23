import { AgentType } from '../../common/enums/agent-type.enum';

export type AiChatAgentIdentity = {
  id: string;
  name: string;
  type: AgentType;
  imageUrl?: string;
};

export type AiChatMessage = {
  id: string;
  senderType: 'USER' | 'AI' | 'SYSTEM';
  content: string;
  createdAt: string;
  sourceMessageId?: string;
  agent?: AiChatAgentIdentity;
};

export type AiChatClarificationQuestion = {
  id: string;
  field: string;
  question: string;
  inputType: 'text' | 'choice' | 'email' | 'datetime' | 'number';
  required: boolean;
  options?: Array<{ label: string; value: string }>;
};

export type AiChatTurnRequest = {
  schemaVersion: '1.0';
  turnId: string;
  idempotencyKey: string;
  organizationId: string;
  conversation: {
    id: string;
    title: string;
    selectedAgent: AiChatAgentIdentity;
  };
  message: AiChatMessage & { senderType: 'USER' };
  recentMessages: AiChatMessage[];
  historyPage: {
    included: number;
    hasOlder: boolean;
    olderMessagesCursor: string | null;
    olderMessagesPath?: string;
  };
  pendingDrafts: Array<{
    id: string;
    kind: 'TASK' | 'MEETING' | 'CRM_RECORD_UPDATE';
    status: 'NEEDS_CLARIFICATION' | 'READY';
    revision: number;
    payload: Record<string, unknown>;
    questions?: AiChatClarificationQuestion[];
  }>;
  context: {
    effectiveTimezone: string;
    language: string;
    currentTime: string;
  };
};

export type AiChatTurnResponse = {
  schemaVersion: '1.0';
  turnId: string;
  conversationId: string;
  inReplyToMessageId: string;
  reply: {
    id: string;
    content: string;
    agent: AiChatAgentIdentity;
  };
  result:
    | { type: 'MESSAGE' }
    | {
        type: 'CLARIFICATION';
        draft: {
          id: string;
          kind: 'TASK' | 'MEETING' | 'CRM_RECORD_UPDATE';
          payload: Record<string, unknown>;
        };
        questions: AiChatClarificationQuestion[];
      }
    | {
        type: 'TASK_PROPOSAL';
        draftId: string;
        proposal: Record<string, unknown>;
      }
    | {
        type: 'MEETING_PROPOSAL';
        draftId: string;
        proposal: Record<string, unknown>;
      }
    | {
        type: 'CRM_RECORD_UPDATE_PROPOSAL';
        draftId: string;
        proposal: Record<string, unknown>;
      };
};
