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
    answerClarification: jest.fn(),
    restoreClarificationAfterRefinementFailure: jest.fn(),
  };
  const jobs = { enqueueActionRefinement: jest.fn() };
  const aiService = { enabled: true };
  let service: AiActionClarificationWorkflowService;

  beforeEach(() => {
    jest.resetAllMocks();
    aiService.enabled = true;
    actions.answerClarification.mockResolvedValue({
      id: input.proposalId,
      status: 'ANALYZING',
    });
    jobs.enqueueActionRefinement.mockResolvedValue({ queued: true });
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

    expect(actions.answerClarification).toHaveBeenCalledWith(
      input.organizationId,
      input.proposalId,
      input.questionId,
      input.answer,
    );
    expect(jobs.enqueueActionRefinement).toHaveBeenCalledWith(input);
  });

  it('does not move a proposal to ANALYZING while AI refinement is disabled', async () => {
    aiService.enabled = false;

    await expect(service.submitAnswer(input)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(actions.answerClarification).not.toHaveBeenCalled();
  });

  it('restores NEEDS_CLARIFICATION if queueing fails after saving the answer', async () => {
    jobs.enqueueActionRefinement.mockRejectedValue(new Error('Redis unavailable'));

    await expect(service.submitAnswer(input)).rejects.toThrow('Redis unavailable');
    expect(actions.restoreClarificationAfterRefinementFailure).toHaveBeenCalledWith(
      input.organizationId,
      input.proposalId,
    );
  });
});
