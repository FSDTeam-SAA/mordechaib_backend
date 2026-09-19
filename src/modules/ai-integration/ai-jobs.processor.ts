import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
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
import { AiAnalysisAction } from '../ai-actions/dto/ai-analysis-result.dto';
import { AiSourceContextService } from '../ai-internal/ai-source-context.service';
import { AiProposalSourceType } from '../../database/schemas/ai-action-proposal.schema';
import { AiActionClarificationWorkflowService } from './ai-action-clarification-workflow.service';
import { AiAnalysisResponseValidator } from './ai-analysis-response.validator';
import { AiChatReplyService } from './ai-chat-reply.service';
import { AgentActivityService } from '../ai-telemetry/agent-activity.service';
import { AgentOperationType } from '../../common/enums/agent-activity.enum';

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
    private readonly config: ConfigService,
    private readonly clarificationWorkflow: AiActionClarificationWorkflowService,
    private readonly responseValidator: AiAnalysisResponseValidator,
    private readonly chatReplies: AiChatReplyService,
    private readonly activity: AgentActivityService,
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
        await this.recoverFailedRefinement(job, error);
        throw new UnrecoverableError(error.message);
      }
      if (error instanceof UnrecoverableError || this.isFinalAttempt(job)) {
        await this.recoverFailedRefinement(job, error);
      }
      throw error;
    }
  }

  private async analyzeSource(job: Job<AnalyzeSourceJob>) {
    const { organizationId, sourceType, sourceId } = job.data;
    const activityId = await this.activity.start({
      organizationId,
      operationType: AgentOperationType.SOURCE_ANALYSIS,
      jobId: String(job.id || `source-${sourceType}-${sourceId}`),
      attempt: job.attemptsMade + 1,
      sourceType,
      sourceId,
    });
    this.logger.log(
      `AI source analysis started: jobId=${String(job.id)}, attempt=${job.attemptsMade + 1}, source=${sourceType}:${sourceId}`,
    );
    let context: MessageAnalysisContext & Record<string, unknown>;
    try {
      context = (await this.sourceContext.sourceContext(
        sourceType,
        sourceId,
        organizationId,
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
        await this.activity.skip(activityId, {
          metadata: { reason: 'superseded-by-newer-message' },
        });
        return {
          skipped: true,
          reason: 'superseded-by-newer-message',
          latestMessageId: context.latestMessageId,
        };
      }
      if (sourceType === 'USER_MESSAGE') {
        const clarification = this.singleClarification(context);
        if (clarification && context.message?.content?.trim()) {
          const questions = Array.isArray(clarification.clarificationQuestions)
            ? clarification.clarificationQuestions
            : [];
          const question = questions.find(
            (item: { id: string }) =>
              !clarification.clarificationAnswers?.[item.id],
          );
          if (question) {
            const proposal = await this.clarificationWorkflow.submitAnswer({
              organizationId,
              proposalId: String(clarification._id),
              questionId: question.id,
              answer: context.message.content.trim(),
            });
            await this.sourceContext.markMessageProcessed(
              organizationId,
              sourceId,
              'COMPLETED',
            );
            await this.activity.skip(activityId, {
              metadata: { reason: 'clarification-answer-routed' },
            });
            return { clarificationSubmitted: proposal };
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
      const requestBody = {
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
      };
      if (this.config.get<boolean>('aiService.logAnalyzeSourceRequestBody')) {
        this.logger.log(
          `AI analyze-source request body: ${JSON.stringify(requestBody)}`,
        );
      }
      const rawAnalysisResult = await this.aiService.request<unknown>(
        '/api/v1/ai/jobs/analyze-source',
        requestBody,
      );
      const analysisResult = await this.responseValidator.validate(
        rawAnalysisResult,
        {
          requestId,
          sourceType: sourceType as AiProposalSourceType,
          sourceId,
        },
      );
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
      let assistantReply:
        Awaited<ReturnType<AiChatReplyService['persist']>> | undefined;
      if (sourceType === 'USER_MESSAGE' && analysisResult.assistantMessage) {
        if (!context.conversationId) {
          throw new UnrecoverableError(
            'User message context is missing conversationId',
          );
        }
        assistantReply = await this.chatReplies.persist({
          organizationId,
          conversationId: context.conversationId,
          sourceMessageId: sourceId,
          assistantMessage: analysisResult.assistantMessage,
        });
      }
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
      const telemetryAgent =
        analysisResult.assistantMessage?.agent ||
        analysisResult.actions[0]?.proposedByAgent;
      await this.activity.succeed(activityId, {
        ...(telemetryAgent ? { agent: telemetryAgent } : {}),
        ...(analysisResult.assistantMessage?.runId
          ? { runId: analysisResult.assistantMessage.runId }
          : {}),
        metadata: {
          actionCount: analysisResult.actions.length,
          assistantMessageCreated: Boolean(assistantReply?.created),
        },
      });
      return {
        proposals: ingested,
        ...(assistantReply
          ? {
              assistantMessageId: String(assistantReply.message._id),
              assistantMessageCreated: assistantReply.created,
            }
          : {}),
      };
    } catch (error) {
      await this.activity.fail(activityId, {
        failureCode: this.analysisFailureCode(error),
        failureMessage:
          error instanceof Error ? error.message : 'Source analysis failed',
      });
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

  private analysisFailureCode(error: unknown) {
    if (error instanceof AiServiceHttpError) {
      return error.retryable ? 'AI_SERVICE_UNAVAILABLE' : 'AI_SERVICE_REJECTED';
    }
    if (error instanceof UnrecoverableError) return 'UNRECOVERABLE_ERROR';
    return 'SOURCE_ANALYSIS_FAILED';
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

  private isFinalAttempt(job: Job) {
    const attempts =
      typeof job.opts.attempts === 'number' ? job.opts.attempts : 1;
    return job.attemptsMade + 1 >= attempts;
  }

  private async recoverFailedRefinement(job: Job, error: unknown) {
    if (job.name !== AI_REFINE_ACTION_JOB) return;
    const data = job.data as Partial<RefineActionJob>;
    if (!data.organizationId || !data.proposalId) return;
    await this.clarificationWorkflow.recoverAfterFinalFailure(
      data.organizationId,
      data.proposalId,
    );
    this.logger.warn(
      `AI clarification refinement restored for retry: proposalId=${data.proposalId}, reason=${error instanceof Error ? error.message : 'unknown error'}`,
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
