import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { AiActionsService } from '../ai-actions/ai-actions.service';
import { AiServiceClient } from './ai-service.client';
import { AiJobsQueue } from './ai-jobs.queue';

export type SubmitAiClarificationAnswer = {
  organizationId: string;
  proposalId: string;
  questionId: string;
  answer: string;
};

/**
 * The single entry point for an answer to any action proposal, independent of
 * whether the proposal came from a call, a meeting, or a chat message.
 */
@Injectable()
export class AiActionClarificationWorkflowService {
  private readonly logger = new Logger(AiActionClarificationWorkflowService.name);

  constructor(
    private readonly actions: AiActionsService,
    private readonly jobs: AiJobsQueue,
    private readonly aiService: AiServiceClient,
  ) {}

  async submitAnswer(input: SubmitAiClarificationAnswer) {
    if (!this.aiService.enabled) {
      throw new ServiceUnavailableException(
        'AI action refinement is currently disabled',
      );
    }

    const proposal = await this.actions.answerClarification(
      input.organizationId,
      input.proposalId,
      input.questionId,
      input.answer,
    );

    try {
      const queued = await this.jobs.enqueueActionRefinement(input);
      if (!queued.queued) {
        throw new ServiceUnavailableException(
          'AI action refinement could not be queued',
        );
      }
      return proposal;
    } catch (error) {
      await this.restoreProposal(input.organizationId, input.proposalId);
      throw error;
    }
  }

  async recoverAfterFinalFailure(organizationId: string, proposalId: string) {
    return this.restoreProposal(organizationId, proposalId);
  }

  private async restoreProposal(organizationId: string, proposalId: string) {
    try {
      return await this.actions.restoreClarificationAfterRefinementFailure(
        organizationId,
        proposalId,
      );
    } catch (error) {
      this.logger.error(
        `Could not restore clarification proposal ${proposalId} after a refinement failure`,
        error instanceof Error ? error.stack : undefined,
      );
      return undefined;
    }
  }
}
