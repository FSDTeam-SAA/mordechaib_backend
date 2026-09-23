import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { isValidObjectId, Model } from 'mongoose';
import { isEmail } from 'class-validator';
import { AgentStatus } from '../../common/enums/agent-status.enum';
import { AgentType } from '../../common/enums/agent-type.enum';
import { Agent } from '../../database/schemas/agent.schema';
import { AiProposalSourceType } from '../../database/schemas/ai-action-proposal.schema';
import {
  AiAnalysisResult,
  AiAssistantMessage,
} from '../ai-actions/dto/ai-analysis-result.dto';

type ExpectedAnalysisIdentity = {
  requestId: string;
  sourceType: AiProposalSourceType;
  sourceId: string;
};

@Injectable()
export class AiAnalysisResponseValidator {
  constructor(
    @InjectModel(Agent.name)
    private readonly agents: Model<Agent>,
  ) {}

  async validate(
    value: unknown,
    expected: ExpectedAnalysisIdentity,
  ): Promise<AiAnalysisResult> {
    if (!this.isRecord(value)) {
      throw new BadRequestException('AI returned an invalid analysis response');
    }
    if (value.requestId !== expected.requestId) {
      throw new BadRequestException('AI response requestId does not match');
    }
    if (
      !this.isRecord(value.source) ||
      value.source.type !== expected.sourceType ||
      value.source.id !== expected.sourceId
    ) {
      throw new BadRequestException('AI response source does not match');
    }
    if (!Array.isArray(value.actions)) {
      throw new BadRequestException('AI response actions must be an array');
    }
    if (!this.isRecord(value.analysis)) {
      throw new BadRequestException('AI response analysis is required');
    }

    let assistantMessage: AiAssistantMessage | undefined;
    if ('assistantMessage' in value) {
      if (expected.sourceType !== AiProposalSourceType.USER_MESSAGE) {
        throw new BadRequestException(
          'assistantMessage is only allowed for USER_MESSAGE sources',
        );
      }
      assistantMessage = await this.validateAssistantMessage(
        value.assistantMessage,
      );
    }

    return {
      ...(value as unknown as AiAnalysisResult),
      ...(assistantMessage ? { assistantMessage } : {}),
    };
  }

  private async validateAssistantMessage(
    value: unknown,
  ): Promise<AiAssistantMessage> {
    if (!this.isRecord(value)) {
      throw new BadRequestException('AI returned an invalid assistantMessage');
    }
    const responseId = this.requiredString(
      value.responseId,
      'assistantMessage.responseId',
      200,
    );
    const content = this.requiredString(
      value.content,
      'assistantMessage.content',
      20_000,
    );
    if (!this.isRecord(value.agent)) {
      throw new BadRequestException('assistantMessage.agent is required');
    }
    const agentId = this.requiredString(
      value.agent.id,
      'assistantMessage.agent.id',
      128,
    );
    const agentName = this.requiredString(
      value.agent.name,
      'assistantMessage.agent.name',
      200,
    );
    if (!Object.values(AgentType).includes(value.agent.type as AgentType)) {
      throw new BadRequestException('assistantMessage.agent.type is invalid');
    }
    if (!isValidObjectId(agentId)) {
      throw new BadRequestException(
        'assistantMessage.agent.id must be a Main Backend agent id',
      );
    }
    const registered = await this.agents
      .findOne({ _id: agentId, status: AgentStatus.ACTIVE })
      .lean()
      .exec();
    if (!registered) {
      throw new BadRequestException(
        'assistantMessage.agent is not an active platform agent',
      );
    }
    if (registered.name !== agentName || registered.type !== value.agent.type) {
      throw new BadRequestException(
        'assistantMessage.agent does not match the platform agent catalog',
      );
    }

    const runId =
      value.runId === undefined
        ? undefined
        : this.requiredString(value.runId, 'assistantMessage.runId', 200);
    let emailDraft: AiAssistantMessage['emailDraft'];
    if (value.emailDraft !== undefined) {
      if (!this.isRecord(value.emailDraft)) {
        throw new BadRequestException('assistantMessage.emailDraft is invalid');
      }
      const draft = value.emailDraft;
      if (
        !Array.isArray(draft.to) ||
        draft.to.length < 1 ||
        draft.to.length > 10 ||
        draft.to.some(
          (recipient) => typeof recipient !== 'string' || !isEmail(recipient),
        )
      ) {
        throw new BadRequestException(
          'assistantMessage.emailDraft.to is invalid',
        );
      }
      emailDraft = {
        to: [
          ...new Set(
            draft.to.map((recipient: string) => recipient.trim().toLowerCase()),
          ),
        ],
        subject: this.requiredString(
          draft.subject,
          'assistantMessage.emailDraft.subject',
          300,
        ),
        body: this.requiredString(
          draft.body,
          'assistantMessage.emailDraft.body',
          20_000,
        ),
      };
    }
    return {
      responseId,
      content,
      agent: {
        id: agentId,
        name: registered.name,
        type: registered.type,
        ...(registered.imageUrl ? { imageUrl: registered.imageUrl } : {}),
      },
      ...(runId ? { runId } : {}),
      ...(emailDraft ? { emailDraft } : {}),
    };
  }

  private requiredString(value: unknown, field: string, maxLength: number) {
    if (typeof value !== 'string') {
      throw new BadRequestException(`${field} must be a string`);
    }
    const normalized = value.trim();
    if (!normalized || normalized.length > maxLength) {
      throw new BadRequestException(
        `${field} must contain between 1 and ${maxLength} characters`,
      );
    }
    return normalized;
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }
}
