import { BadRequestException } from '@nestjs/common';
import { Model } from 'mongoose';
import { AgentStatus } from '../../common/enums/agent-status.enum';
import { AgentType } from '../../common/enums/agent-type.enum';
import { Agent } from '../../database/schemas/agent.schema';
import { AiProposalSourceType } from '../../database/schemas/ai-action-proposal.schema';
import { AiAnalysisResponseValidator } from './ai-analysis-response.validator';

describe('AiAnalysisResponseValidator', () => {
  const agentId = '507f1f77bcf86cd799439011';
  const requestId = 'source-user_message-507f1f77bcf86cd799439012';
  const sourceId = '507f1f77bcf86cd799439012';
  let agents: { findOne: jest.Mock };
  let validator: AiAnalysisResponseValidator;

  beforeEach(() => {
    agents = { findOne: jest.fn() };
    validator = new AiAnalysisResponseValidator(
      agents as unknown as Model<Agent>,
    );
  });

  it('accepts a catalog-backed assistant reply for a user message', async () => {
    agents.findOne.mockReturnValue(
      queryResult({
        _id: agentId,
        name: 'Laura',
        type: AgentType.CHIEF_OF_STAFF,
        status: AgentStatus.ACTIVE,
      }),
    );

    const result = await validator.validate(validResponse(), {
      requestId,
      sourceType: AiProposalSourceType.USER_MESSAGE,
      sourceId,
    });

    expect(agents.findOne).toHaveBeenCalledWith({
      _id: agentId,
      status: AgentStatus.ACTIVE,
    });
    expect(result.assistantMessage).toEqual({
      responseId: `${requestId}:reply:v1`,
      content: 'I can help with that.',
      agent: {
        id: agentId,
        name: 'Laura',
        type: AgentType.CHIEF_OF_STAFF,
      },
      runId: 'run-1',
    });
  });

  it('rejects a response whose source identity does not match', async () => {
    await expect(
      validator.validate(
        {
          ...validResponse(),
          source: { type: AiProposalSourceType.USER_MESSAGE, id: 'wrong' },
        },
        {
          requestId,
          sourceType: AiProposalSourceType.USER_MESSAGE,
          sourceId,
        },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(agents.findOne).not.toHaveBeenCalled();
  });

  it('rejects assistantMessage for a non-user source', async () => {
    await expect(
      validator.validate(
        {
          ...validResponse(),
          source: { type: AiProposalSourceType.GOOGLE_MEET, id: sourceId },
        },
        {
          requestId,
          sourceType: AiProposalSourceType.GOOGLE_MEET,
          sourceId,
        },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects an agent identity that differs from the catalog', async () => {
    agents.findOne.mockReturnValue(
      queryResult({
        _id: agentId,
        name: 'Different name',
        type: AgentType.CHIEF_OF_STAFF,
        status: AgentStatus.ACTIVE,
      }),
    );

    await expect(
      validator.validate(validResponse(), {
        requestId,
        sourceType: AiProposalSourceType.USER_MESSAGE,
        sourceId,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  function validResponse() {
    return {
      requestId,
      source: { type: AiProposalSourceType.USER_MESSAGE, id: sourceId },
      assistantMessage: {
        responseId: `${requestId}:reply:v1`,
        content: 'I can help with that.',
        agent: {
          id: agentId,
          name: 'Laura',
          type: AgentType.CHIEF_OF_STAFF,
        },
        runId: 'run-1',
      },
      actions: [],
      analysis: {},
    };
  }

  function queryResult(value: unknown) {
    return { lean: () => ({ exec: () => Promise.resolve(value) }) };
  }
});
