import { BadRequestException, Injectable } from '@nestjs/common';
import { AgentType } from '../../common/enums/agent-type.enum';
import {
  AiChatAgentIdentity,
  AiChatClarificationQuestion,
  AiChatTurnRequest,
  AiChatTurnResponse,
} from './ai-chat.types';

@Injectable()
export class AiChatResponseValidator {
  validate(value: unknown, request: AiChatTurnRequest): AiChatTurnResponse {
    const response = this.record(value, 'AI chat response');
    this.equal(response.schemaVersion, '1.0', 'schemaVersion');
    this.equal(response.turnId, request.turnId, 'turnId');
    this.equal(
      response.conversationId,
      request.conversation.id,
      'conversationId',
    );
    this.equal(
      response.inReplyToMessageId,
      request.message.id,
      'inReplyToMessageId',
    );
    const reply = this.record(response.reply, 'reply');
    const replyId = this.text(reply.id, 'reply.id', 200);
    const content = this.text(reply.content, 'reply.content', 20_000);
    const agent = this.agent(reply.agent);
    if (!this.sameAgent(agent, request.conversation.selectedAgent)) {
      throw new BadRequestException(
        'AI chat response agent does not match the selected agent',
      );
    }
    const result = this.result(response.result);
    return {
      schemaVersion: '1.0',
      turnId: request.turnId,
      conversationId: request.conversation.id,
      inReplyToMessageId: request.message.id,
      reply: { id: replyId, content, agent },
      result,
    };
  }

  private result(value: unknown): AiChatTurnResponse['result'] {
    const result = this.record(value, 'result');
    const type = this.text(result.type, 'result.type', 40);
    if (type === 'MESSAGE') return { type };
    if (type === 'CLARIFICATION') {
      const draft = this.record(result.draft, 'result.draft');
      const kind = this.kind(draft.kind);
      const questions = this.questions(result.questions);
      if (!questions.length) {
        throw new BadRequestException(
          'CLARIFICATION must contain at least one question',
        );
      }
      return {
        type,
        draft: {
          id: this.text(draft.id, 'result.draft.id', 200),
          kind,
          payload: this.record(draft.payload, 'result.draft.payload'),
        },
        questions,
      };
    }
    if (
      type === 'TASK_PROPOSAL' ||
      type === 'MEETING_PROPOSAL' ||
      type === 'CRM_RECORD_UPDATE_PROPOSAL'
    ) {
      return {
        type,
        draftId: this.text(result.draftId, 'result.draftId', 200),
        proposal: this.record(result.proposal, 'result.proposal'),
      };
    }
    throw new BadRequestException(
      'AI chat returned an unsupported result type',
    );
  }

  private questions(value: unknown): AiChatClarificationQuestion[] {
    if (!Array.isArray(value) || value.length > 10) {
      throw new BadRequestException('Invalid clarification questions');
    }
    const ids = new Set<string>();
    return value.map((item, index) => {
      const question = this.record(item, `questions[${index}]`);
      const id = this.text(question.id, `questions[${index}].id`, 128);
      if (ids.has(id)) throw new BadRequestException('Duplicate question id');
      ids.add(id);
      const inputType = this.text(
        question.inputType,
        `questions[${index}].inputType`,
        32,
      );
      if (
        !['text', 'choice', 'email', 'datetime', 'number'].includes(inputType)
      ) {
        throw new BadRequestException('Invalid clarification input type');
      }
      const options = question.options;
      return {
        id,
        field: this.text(question.field, `questions[${index}].field`, 200),
        question: this.text(
          question.question,
          `questions[${index}].question`,
          2_000,
        ),
        inputType: inputType as AiChatClarificationQuestion['inputType'],
        required: question.required !== false,
        ...(options === undefined
          ? {}
          : {
              options: this.options(options, index),
            }),
      };
    });
  }

  private options(value: unknown, questionIndex: number) {
    if (!Array.isArray(value) || value.length > 20) {
      throw new BadRequestException('Invalid clarification options');
    }
    return value.map((item, optionIndex) => {
      const option = this.record(
        item,
        `questions[${questionIndex}].options[${optionIndex}]`,
      );
      return {
        label: this.text(option.label, 'option.label', 200),
        value: this.text(option.value, 'option.value', 200),
      };
    });
  }

  private agent(value: unknown): AiChatAgentIdentity {
    const agent = this.record(value, 'reply.agent');
    const type = this.text(agent.type, 'reply.agent.type', 100);
    if (!Object.values(AgentType).includes(type as AgentType)) {
      throw new BadRequestException('AI chat returned an invalid agent type');
    }
    return {
      id: this.text(agent.id, 'reply.agent.id', 128),
      name: this.text(agent.name, 'reply.agent.name', 200),
      type: type as AgentType,
      ...(agent.imageUrl === undefined
        ? {}
        : { imageUrl: this.text(agent.imageUrl, 'reply.agent.imageUrl', 500) }),
    };
  }

  private kind(value: unknown) {
    if (
      value !== 'TASK' &&
      value !== 'MEETING' &&
      value !== 'CRM_RECORD_UPDATE'
    ) {
      throw new BadRequestException('Invalid chat draft kind');
    }
    return value;
  }

  private sameAgent(left: AiChatAgentIdentity, right: AiChatAgentIdentity) {
    return (
      left.id === right.id &&
      left.name === right.name &&
      left.type === right.type &&
      left.imageUrl === right.imageUrl
    );
  }

  private record(value: unknown, field: string): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new BadRequestException(`${field} must be an object`);
    }
    return value as Record<string, unknown>;
  }

  private text(value: unknown, field: string, max: number) {
    if (typeof value !== 'string' || !value.trim() || value.length > max) {
      throw new BadRequestException(`${field} is invalid`);
    }
    return value.trim();
  }

  private equal(actual: unknown, expected: string, field: string) {
    if (actual !== expected) {
      throw new BadRequestException(`AI chat response ${field} mismatch`);
    }
  }
}
