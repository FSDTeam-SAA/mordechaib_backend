import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UserRole } from '../../common/enums/user-role.enum';
import { RequestUser } from '../../common/types/request-context.type';
import { AiActionsService } from '../ai-actions/ai-actions.service';
import { AiActionClarificationWorkflowService } from '../ai-integration/ai-action-clarification-workflow.service';
import { CallIntelligenceProposalsFacade } from './call-intelligence-proposals.facade';
import {
  CallIntelligenceProposalCommand,
  ExecuteCallIntelligenceProposalDto,
} from './dto/execute-call-intelligence-proposal.dto';

describe('CallIntelligenceProposalsFacade', () => {
  const organizationId = 'organization-1';
  const proposalId = 'proposal-1';
  const actor: RequestUser = {
    id: 'user-1',
    email: 'owner@example.com',
    firstName: 'Test',
    lastName: 'Owner',
    organizationId,
    role: UserRole.OWNER,
    sessionId: 'session-1',
    isPlatformAdmin: false,
  };
  const actions = {
    approve: jest.fn(),
    reject: jest.fn(),
    retry: jest.fn(),
    list: jest.fn(),
    get: jest.fn(),
  };
  const clarifications = { submitAnswer: jest.fn() };
  let facade: CallIntelligenceProposalsFacade;

  beforeEach(() => {
    jest.resetAllMocks();
    facade = new CallIntelligenceProposalsFacade(
      actions as unknown as AiActionsService,
      clarifications as unknown as AiActionClarificationWorkflowService,
    );
  });

  it.each([
    CallIntelligenceProposalCommand.APPROVE,
    CallIntelligenceProposalCommand.RETRY,
  ])('dispatches %s to the stored proposal service', async (action) => {
    const handler =
      action === CallIntelligenceProposalCommand.APPROVE
        ? actions.approve
        : actions.retry;
    handler.mockResolvedValue({ status: 'EXECUTED' });

    await facade.execute(organizationId, actor, proposalId, { action });

    expect(handler).toHaveBeenCalledWith(organizationId, actor, proposalId);
  });

  it('dispatches REJECT with its reason', async () => {
    actions.reject.mockResolvedValue({ status: 'REJECTED' });

    await facade.execute(organizationId, actor, proposalId, {
      action: CallIntelligenceProposalCommand.REJECT,
      reason: 'Not required',
    });

    expect(actions.reject).toHaveBeenCalledWith(
      organizationId,
      actor,
      proposalId,
      'Not required',
    );
  });

  it('uses the same refinement workflow for the explicit clarification route', async () => {
    clarifications.submitAnswer.mockResolvedValue({ status: 'ANALYZING' });

    await facade.answerClarification(organizationId, proposalId, {
      questionId: 'invitee-email',
      answer: 'hassan@example.com',
    });

    expect(clarifications.submitAnswer).toHaveBeenCalledWith({
      organizationId,
      proposalId,
      questionId: 'invitee-email',
      answer: 'hassan@example.com',
    });
  });

  it('requires a rejection reason and rejects clarification as an action command', async () => {
    const invalidReject = plainToInstance(ExecuteCallIntelligenceProposalDto, {
      action: CallIntelligenceProposalCommand.REJECT,
    });
    const invalidClarification = plainToInstance(
      ExecuteCallIntelligenceProposalDto,
      {
        action: 'ANSWER_CLARIFICATION',
      },
    );
    const validApprove = plainToInstance(ExecuteCallIntelligenceProposalDto, {
      action: CallIntelligenceProposalCommand.APPROVE,
    });

    await expect(validate(invalidReject)).resolves.not.toHaveLength(0);
    await expect(validate(invalidClarification)).resolves.not.toHaveLength(0);
    await expect(validate(validApprove)).resolves.toHaveLength(0);
  });
});
