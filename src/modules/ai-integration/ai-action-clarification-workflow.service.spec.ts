import { ServiceUnavailableException } from '@nestjs/common';
import { AiActionsService } from '../ai-actions/ai-actions.service';
import { AiServiceClient } from './ai-service.client';
import {
  AiActionClarificationWorkflowService,
  SubmitAiClarificationAnswer,
} from './ai-action-clarification-workflow.service';
import { AiJobsQueue } from './ai-jobs.queue';

describe('AiActionClarificationWorkflowService', () => {
  const input: SubmitAiClarificationAnswer = {
    organizationId: '66cc9bdfa847ea856c7b41d2',
    proposalId: '66cc9bdfa847ea856c7b41d5',
    questionId: 'meeting-start-time',
    answer: '2026-09-16T15:00:00+06:00',
  };
  const actions = {
    validateClarificationAnswer: jest.fn(),
    answerClarification: jest.fn(),
    restoreClarificationAfterRefinementFailure: jest.fn(),
    findStaleClarificationRefinements: jest.fn(),
  };
  const jobs = {
    enqueueActionRefinement: jest.fn(),
    enqueueActionRefinementRecovery: jest.fn(),
  };
  const aiService = { enabled: true };
  let service: AiActionClarificationWorkflowService;

  beforeEach(() => {
    jest.resetAllMocks();
    aiService.enabled = true;
    actions.validateClarificationAnswer.mockResolvedValue({ revision: 3 });
    actions.findStaleClarificationRefinements.mockResolvedValue([]);
    actions.answerClarification.mockResolvedValue({
      id: input.proposalId,
      status: 'ANALYZING',
      updatedAt: '2026-09-16T09:00:00.000Z',
    });
    jobs.enqueueActionRefinement.mockResolvedValue({ queued: true });
    jobs.enqueueActionRefinementRecovery.mockResolvedValue({ queued: true });
    service = new AiActionClarificationWorkflowService(
      actions as unknown as AiActionsService,
      jobs as unknown as AiJobsQueue,
      aiService as AiServiceClient,
    );
  });

  it('uses one workflow to save an answer and queue refinement', async () => {
    await expect(service.submitAnswer(input)).resolves.toEqual(
      expect.objectContaining({ status: 'ANALYZING' }),
    );

    expect(actions.validateClarificationAnswer).toHaveBeenCalledWith(
      input.organizationId,
      input.proposalId,
      input.questionId,
    );
    expect(jobs.enqueueActionRefinement).toHaveBeenCalledWith({
      ...input,
      revision: 3,
    });
    expect(actions.answerClarification).toHaveBeenCalledWith(
      input.organizationId,
      input.proposalId,
      input.questionId,
      input.answer,
    );
    expect(jobs.enqueueActionRefinementRecovery).toHaveBeenCalledWith({
      organizationId: input.organizationId,
      proposalId: input.proposalId,
      proposalUpdatedAt: '2026-09-16T09:00:00.000Z',
    });
    expect(jobs.enqueueActionRefinement.mock.invocationCallOrder[0]).toBeLessThan(
      actions.answerClarification.mock.invocationCallOrder[0],
    );
  });

  it('does not move a proposal to ANALYZING while AI refinement is disabled', async () => {
    aiService.enabled = false;

    await expect(service.submitAnswer(input)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(actions.validateClarificationAnswer).not.toHaveBeenCalled();
    expect(actions.answerClarification).not.toHaveBeenCalled();
  });

  it('restores NEEDS_CLARIFICATION if recovery scheduling fails after saving the answer', async () => {
    jobs.enqueueActionRefinementRecovery.mockRejectedValue(
      new Error('Redis unavailable'),
    );

    await expect(service.submitAnswer(input)).rejects.toThrow('Redis unavailable');
    expect(actions.restoreClarificationAfterRefinementFailure).toHaveBeenCalledWith(
      input.organizationId,
      input.proposalId,
      undefined,
    );
  });

  it('keeps the proposal answerable when refinement cannot be queued', async () => {
    jobs.enqueueActionRefinement.mockRejectedValue(new Error('Redis unavailable'));

    await expect(service.submitAnswer(input)).rejects.toThrow('Redis unavailable');

    expect(actions.answerClarification).not.toHaveBeenCalled();
  });

  it('restores only the matching stale ANALYZING attempt', async () => {
    const updatedAt = '2026-09-16T09:00:00.000Z';

    await service.recoverStaleRefinement(
      input.organizationId,
      input.proposalId,
      updatedAt,
    );

    expect(actions.restoreClarificationAfterRefinementFailure).toHaveBeenCalledWith(
      input.organizationId,
      input.proposalId,
      new Date(updatedAt),
    );
  });

  it('requeues pre-deployment stale ANALYZING proposals during startup', async () => {
    actions.findStaleClarificationRefinements.mockResolvedValue([
      {
        _id: input.proposalId,
        organizationId: input.organizationId,
        updatedAt: new Date('2026-09-16T09:00:00.000Z'),
      },
    ]);

    await service.onModuleInit();

    expect(jobs.enqueueActionRefinementRecovery).toHaveBeenCalledWith(
      {
        organizationId: input.organizationId,
        proposalId: input.proposalId,
        proposalUpdatedAt: '2026-09-16T09:00:00.000Z',
      },
      0,
    );
  });
});
