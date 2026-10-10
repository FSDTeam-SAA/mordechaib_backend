import {
  Injectable,
  Logger,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { AiActionsService } from '../ai-actions/ai-actions.service';
import { AiServiceClient } from './ai-service.client';
import { ACTION_REFINEMENT_STALE_MS, AiJobsQueue } from './ai-jobs.queue';

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
export class AiActionClarificationWorkflowService implements OnModuleInit {
  private readonly logger = new Logger(AiActionClarificationWorkflowService.name);

  constructor(
    private readonly actions: AiActionsService,
    private readonly jobs: AiJobsQueue,
    private readonly aiService: AiServiceClient,
  ) {}

  async onModuleInit() {
    try {
      const stale = await this.actions.findStaleClarificationRefinements(
        new Date(Date.now() - ACTION_REFINEMENT_STALE_MS),
      );
      await Promise.all(
        stale.map((proposal) => {
          const stored = proposal as unknown as {
            _id: unknown;
            organizationId: string;
            updatedAt: Date;
          };
          return this.jobs.enqueueActionRefinementRecovery(
            {
              organizationId: stored.organizationId,
              proposalId: String(stored._id),
              proposalUpdatedAt: new Date(stored.updatedAt).toISOString(),
            },
            0,
          );
        }),
      );
    } catch (error) {
      this.logger.error(
        'Could not schedule stale clarification recovery during startup',
        error instanceof Error ? error.stack : undefined,
      );
    }
  }

  async submitAnswer(input: SubmitAiClarificationAnswer) {
    if (!this.aiService.enabled) {
      throw new ServiceUnavailableException(
        'AI action refinement is currently disabled',
      );
    }

    const validated = await this.actions.validateClarificationAnswer(
      input.organizationId,
      input.proposalId,
      input.questionId,
    );
    try {
      const queued = await this.jobs.enqueueActionRefinement({
        ...input,
        revision: validated.revision,
      });
      if (!queued.queued) {
        throw new ServiceUnavailableException(
          'AI action refinement could not be queued',
        );
      }
      const proposal = (await this.actions.answerClarification(
        input.organizationId,
        input.proposalId,
        input.questionId,
        input.answer,
      )) as { updatedAt?: string | Date; [key: string]: unknown };
      if (!proposal.updatedAt) {
        throw new ServiceUnavailableException(
          'AI action refinement recovery could not be scheduled',
        );
      }
      await this.jobs.enqueueActionRefinementRecovery({
        organizationId: input.organizationId,
        proposalId: input.proposalId,
        proposalUpdatedAt: new Date(proposal.updatedAt).toISOString(),
      });
      return proposal;
    } catch (error) {
      await this.restoreProposal(input.organizationId, input.proposalId);
      throw error;
    }
  }

  async recoverAfterFinalFailure(organizationId: string, proposalId: string) {
    return this.restoreProposal(organizationId, proposalId);
  }

  async recoverStaleRefinement(
    organizationId: string,
    proposalId: string,
    proposalUpdatedAt: string,
  ) {
    return this.actions.restoreClarificationAfterRefinementFailure(
      organizationId,
      proposalId,
      new Date(proposalUpdatedAt),
    );
  }

  private async restoreProposal(
    organizationId: string,
    proposalId: string,
    expectedUpdatedAt?: Date,
  ) {
    try {
      return await this.actions.restoreClarificationAfterRefinementFailure(
        organizationId,
        proposalId,
        expectedUpdatedAt,
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
