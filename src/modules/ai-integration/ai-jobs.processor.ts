import { Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job, UnrecoverableError } from 'bullmq';
import { AiServiceClient, AiServiceHttpError } from './ai-service.client';
import { CallTranscriptionService } from './call-transcription.service';
import {
  AI_ANALYZE_SOURCE_JOB,
  AI_JOBS_QUEUE,
  AI_REFINE_ACTION_JOB,
  AI_SYNC_AGENT_JOB,
  AI_TRANSCRIBE_CALL_JOB,
  AgentSyncEvent,
  AiJobsQueue,
  AnalyzeSourceJob,
  RefineActionJob,
  TranscribeCallJob,
} from './ai-jobs.queue';
import { AiActionsService } from '../ai-actions/ai-actions.service';
import {
  AiAnalysisAction,
  AiAnalysisResult,
} from '../ai-actions/dto/ai-analysis-result.dto';
import { AiSourceContextService } from '../ai-internal/ai-source-context.service';
import { AiProposalSourceType } from '../../database/schemas/ai-action-proposal.schema';

type MessageAnalysisContext = {
  organizationId: string;
  requesterUserId?: string;
  conversationId?: string;
  latestMessageId?: string;
  message?: { content?: string };
  pendingProposals?: Array<{
    _id: unknown;
    status: string;
    clarificationQuestions: Array<{ id: string }>;
    clarificationAnswers?: Record<string, string>;
  }>;
};

@Processor(AI_JOBS_QUEUE, { concurrency: 5 })
export class AiJobsProcessor extends WorkerHost {
  private readonly logger = new Logger(AiJobsProcessor.name);

  constructor(
    private readonly aiService: AiServiceClient,
    private readonly transcription: CallTranscriptionService,
    private readonly jobs: AiJobsQueue,
    private readonly actions: AiActionsService,
    private readonly sourceContext: AiSourceContextService,
  ) {
    super();
  }

  async process(job: Job) {
    try {
      switch (job.name) {
        case AI_ANALYZE_SOURCE_JOB:
          return this.analyzeSource(job as Job<AnalyzeSourceJob>);
        case AI_REFINE_ACTION_JOB:
          return this.refineAction(job as Job<RefineActionJob>);
        case AI_TRANSCRIBE_CALL_JOB:
          return this.transcribeCall(job as Job<TranscribeCallJob>);
        case AI_SYNC_AGENT_JOB:
          return this.syncAgent(job as Job<AgentSyncEvent>);
        default:
          throw new UnrecoverableError(`Unsupported AI job ${job.name}`);
      }
    } catch (error) {
      this.logger.error(
        `AI job ${job.name} failed on attempt ${job.attemptsMade + 1}`,
        error instanceof Error ? error.stack : undefined,
      );
      if (error instanceof AiServiceHttpError && !error.retryable) {
        throw new UnrecoverableError(error.message);
      }
      throw error;
    }
  }

  private async analyzeSource(job: Job<AnalyzeSourceJob>) {
    const { organizationId, sourceType, sourceId } = job.data;
    this.logger.log(
      `AI source analysis started: jobId=${String(job.id)}, attempt=${job.attemptsMade + 1}, source=${sourceType}:${sourceId}`,
    );
    let context: MessageAnalysisContext & Record<string, unknown>;
    try {
      context = (await this.sourceContext.sourceContext(
        sourceType,
        sourceId,
      )) as unknown as MessageAnalysisContext & Record<string, unknown>;
      this.logger.log(
        `AI source context prepared: jobId=${String(job.id)}, source=${sourceType}:${sourceId}`,
      );
      if (
        sourceType === 'USER_MESSAGE' &&
        context.latestMessageId &&
        context.latestMessageId !== sourceId
      ) {
        await this.sourceContext.markMessageProcessed(
          organizationId,
          sourceId,
          'COMPLETED',
        );
        return {
          skipped: true,
          reason: 'superseded-by-newer-message',
          latestMessageId: context.latestMessageId,
        };
      }
      if (sourceType === 'USER_MESSAGE') {
        const clarification = this.singleClarification(context);
        if (clarification && context.message?.content?.trim()) {
          const proposal = (await this.actions.get(
            organizationId,
            String(clarification._id),
          )) as unknown as { requestId: string; [key: string]: unknown };
          const questions = Array.isArray(clarification.clarificationQuestions)
            ? clarification.clarificationQuestions
            : [];
          const question = questions.find(
            (item: { id: string }) =>
              !clarification.clarificationAnswers?.[item.id],
          );
          if (question) {
            const refined = await this.aiService.request<{
              action: AiAnalysisAction;
            }>('/api/v1/ai/actions/refine', {
              requestId: proposal.requestId,
              proposal,
              clarification: {
                questionId: question.id,
                answer: context.message.content.trim(),
              },
            });
            if (!refined?.action) {
              throw new UnrecoverableError(
                'AI service returned an invalid clarification response',
              );
            }
            const refinedProposal = await this.actions.applyClarificationResult(
              organizationId,
              String(clarification._id),
              refined.action,
            );
            await this.sourceContext.markMessageProcessed(
              organizationId,
              sourceId,
              'COMPLETED',
            );
            return { refinedProposal };
          }
        }
      }
      if (context.organizationId !== organizationId) {
        throw new UnrecoverableError(
          'AI source organization does not match the queued job',
        );
      }
      const organization =
        await this.sourceContext.organizationContext(organizationId);
      const requester = await this.sourceContext.requesterContext(
        organizationId,
        context.requesterUserId,
      );
      const effectiveTimezone = requester?.timezone || organization.timezone;
      const boundedContext = { ...context };
      delete boundedContext.requesterUserId;
      const requestId = `source-${sourceType.toLowerCase()}-${sourceId}`;
      const analysisResult = await this.aiService.request<AiAnalysisResult>(
        '/api/v1/ai/jobs/analyze-source',
        {
          schemaVersion: '1.0',
          jobId: requestId,
          idempotencyKey: requestId,
          organizationId,
          source: { type: sourceType, id: sourceId },
          context: {
            ...boundedContext,
            organization,
            ...(requester ? { requester } : {}),
            effectiveTimezone,
          },
          generatedAt: new Date().toISOString(),
        },
      );
      if (!analysisResult || !Array.isArray(analysisResult.actions)) {
        throw new UnrecoverableError(
          'AI service returned an invalid analysis response',
        );
      }
      this.logger.log(
        `AI analysis response accepted: jobId=${String(job.id)}, source=${sourceType}:${sourceId}, actions=${analysisResult.actions.length}`,
      );
      const ingested = await this.actions.ingestAnalysis(
        organizationId,
        { type: sourceType as AiProposalSourceType, id: sourceId },
        analysisResult,
        {
          conversationId: context.conversationId,
          effectiveTimezone,
          expectedRequestId: requestId,
        },
      );
      if (sourceType === 'USER_MESSAGE') {
        await this.sourceContext.markMessageProcessed(
          organizationId,
          sourceId,
          'COMPLETED',
        );
      }
      this.logger.log(
        `AI proposals persisted: jobId=${String(job.id)}, source=${sourceType}:${sourceId}`,
      );
      return ingested;
    } catch (error) {
      if (sourceType === 'USER_MESSAGE') {
        await this.sourceContext
          .markMessageProcessed(
            organizationId,
            sourceId,
            'FAILED',
            error instanceof Error ? error.message : undefined,
          )
          .catch(() => undefined);
      }
      throw error;
    }
  }

  private singleClarification(context: MessageAnalysisContext) {
    const candidates = Array.isArray(context.pendingProposals)
      ? context.pendingProposals.filter(
          (proposal: { status: string }) =>
            proposal.status === 'NEEDS_CLARIFICATION',
        )
      : [];
    return candidates.length === 1 ? candidates[0] : undefined;
  }

  private async refineAction(job: Job<RefineActionJob>) {
    const proposal = (await this.actions.get(
      job.data.organizationId,
      job.data.proposalId,
    )) as unknown as { requestId: string; [key: string]: unknown };
    const result = await this.aiService.request<{ action: AiAnalysisAction }>(
      '/api/v1/ai/actions/refine',
      {
        requestId: proposal.requestId,
        proposal,
        clarification: {
          questionId: job.data.questionId,
          answer: job.data.answer,
        },
      },
    );
    if (!result?.action) {
      throw new UnrecoverableError(
        'AI service returned an invalid clarification response',
      );
    }
    return this.actions.applyClarificationResult(
      job.data.organizationId,
      job.data.proposalId,
      result.action,
    );
  }

  private async transcribeCall(job: Job<TranscribeCallJob>) {
    const result = await this.transcription.transcribe(job.data.recordingId);
    if (!result.duplicate) {
      await this.jobs.enqueueSourceAnalysis({
        organizationId: result.organizationId,
        sourceType: 'CALL_TRANSCRIPT',
        sourceId: job.data.recordingId,
      });
    }
    return result;
  }

  private async syncAgent(job: Job<AgentSyncEvent>) {
    const result = await this.aiService.request<{
      eventId: string;
      accepted: boolean;
    }>('/api/v1/ai/agents/events', job.data);
    if (result?.eventId !== job.data.eventId || result.accepted !== true) {
      throw new UnrecoverableError(
        'AI service returned an invalid agent synchronization acknowledgement',
      );
    }
    return result;
  }
}
