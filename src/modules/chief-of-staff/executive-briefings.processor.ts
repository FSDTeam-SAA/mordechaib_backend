import { Processor, WorkerHost } from '@nestjs/bullmq';
import { BadRequestException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job, UnrecoverableError } from 'bullmq';
import { AgentOperationType } from '../../common/enums/agent-activity.enum';
import { AgentType } from '../../common/enums/agent-type.enum';
import { AgentActivityService } from '../ai-telemetry/agent-activity.service';
import {
  AiServiceClient,
  AiServiceHttpError,
} from '../ai-integration/ai-service.client';
import { ExecutiveBriefingAiRequest } from './executive-briefing.types';
import { ExecutiveBriefingResponseValidator } from './executive-briefing-response.validator';
import { ExecutiveBriefingsRepository } from './executive-briefings.repository';
import {
  EXECUTIVE_BRIEFINGS_QUEUE,
  GENERATE_EXECUTIVE_BRIEFING_JOB,
  GenerateExecutiveBriefingJob,
} from './executive-briefings.queue';

@Processor(EXECUTIVE_BRIEFINGS_QUEUE, { concurrency: 2 })
export class ExecutiveBriefingsProcessor extends WorkerHost {
  private readonly logger = new Logger(ExecutiveBriefingsProcessor.name);

  constructor(
    private readonly repository: ExecutiveBriefingsRepository,
    private readonly aiService: AiServiceClient,
    private readonly validator: ExecutiveBriefingResponseValidator,
    private readonly config: ConfigService,
    private readonly activity: AgentActivityService,
  ) {
    super();
  }

  async process(job: Job<GenerateExecutiveBriefingJob>) {
    if (job.name !== GENERATE_EXECUTIVE_BRIEFING_JOB) {
      throw new UnrecoverableError(
        `Unsupported executive briefing job ${job.name}`,
      );
    }
    const { organizationId, briefingId } = job.data;
    const claimed = await this.repository.claimForGeneration(
      organizationId,
      briefingId,
    );
    if (!claimed) {
      const existing = await this.repository.findForWorker(
        organizationId,
        briefingId,
      );
      if (existing?.status === 'READY') return { duplicate: true };
      throw new UnrecoverableError('Executive briefing cannot be claimed');
    }
    const input = claimed.input as unknown as ExecutiveBriefingAiRequest;
    const chiefOfStaff = input.agents.find(
      (agent) => agent.type === AgentType.CHIEF_OF_STAFF,
    );
    const activityId = await this.activity.start({
      organizationId,
      operationType: AgentOperationType.EXECUTIVE_BRIEFING,
      jobId: String(job.id || input.jobId),
      attempt: job.attemptsMade + 1,
      sourceType: 'EXECUTIVE_BRIEFING',
      sourceId: briefingId,
      ...(chiefOfStaff
        ? {
            agent: {
              id: chiefOfStaff.id,
              name: chiefOfStaff.name,
              type: chiefOfStaff.type as AgentType,
            },
          }
        : {}),
    });
    try {
      const raw = await this.aiService.request<unknown>(
        '/api/v1/ai/briefings/generate',
        input as unknown as Record<string, unknown>,
        {
          timeoutMs: this.config.get<number>(
            'aiService.briefingTimeoutMs',
            60_000,
          ),
        },
      );
      const content = this.validator.validate(raw, input);
      const ready = await this.repository.markReady(
        organizationId,
        briefingId,
        content,
      );
      if (!ready) throw new Error('Executive briefing could not be saved');
      await this.activity.succeed(activityId, {
        metadata: { briefingType: input.briefingType },
      });
      this.logger.log(`Executive briefing ready: id=${briefingId}`);
      return { briefingId, status: 'READY' };
    } catch (error) {
      const retryable =
        error instanceof AiServiceHttpError
          ? error.retryable
          : !(error instanceof BadRequestException);
      await this.activity.fail(activityId, {
        failureCode: this.errorCode(error),
        failureMessage:
          error instanceof Error ? error.message : 'Briefing generation failed',
        metadata: { briefingType: input.briefingType },
      });
      await this.repository
        .markFailed(organizationId, briefingId, {
          code: this.errorCode(error),
          message:
            error instanceof Error
              ? error.message
              : 'Briefing generation failed',
          retryable,
        })
        .catch(() => undefined);
      if (!retryable) {
        throw new UnrecoverableError(
          error instanceof Error
            ? error.message
            : 'Invalid AI briefing response',
        );
      }
      throw error;
    }
  }

  private errorCode(error: unknown) {
    if (error instanceof BadRequestException) return 'INVALID_AI_RESPONSE';
    if (error instanceof AiServiceHttpError) {
      return error.retryable ? 'AI_SERVICE_UNAVAILABLE' : 'AI_SERVICE_REJECTED';
    }
    return 'BRIEFING_GENERATION_FAILED';
  }
}
