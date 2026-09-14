import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import crypto from 'crypto';
import { Queue } from 'bullmq';
import { AiServiceClient } from './ai-service.client';
import { CallTranscriptionService } from './call-transcription.service';
import { AgentStatus } from '../../common/enums/agent-status.enum';
import { AgentType } from '../../common/enums/agent-type.enum';

export const AI_JOBS_QUEUE = 'ai-jobs';
export const AI_ANALYZE_SOURCE_JOB = 'analyze-source';
export const AI_TRANSCRIBE_CALL_JOB = 'transcribe-call';
export const AI_SYNC_AGENT_JOB = 'sync-agent';

export type AgentSyncEventType =
  'AGENT_UPSERTED' | 'AGENT_DISABLED' | 'AGENT_ACTIVATED';

export type AgentSyncEvent = {
  schemaVersion: '1.0';
  eventId: string;
  eventType: AgentSyncEventType;
  agent: {
    id: string;
    name: string;
    imageUrl?: string;
    type: AgentType;
    status: AgentStatus;
    version: number;
  };
  occurredAt: string;
};

export type AnalyzeSourceJob = {
  organizationId: string;
  sourceType:
    | 'CALL_AUDIO'
    | 'CALL_TRANSCRIPT'
    | 'ZOOM_MEETING'
    | 'GOOGLE_MEET'
    | 'USER_MESSAGE';
  sourceId: string;
};

export const AI_REFINE_ACTION_JOB = 'refine-action';
export type RefineActionJob = {
  organizationId: string;
  proposalId: string;
  questionId: string;
  answer: string;
};

export type TranscribeCallJob = {
  organizationId: string;
  recordingId: string;
};

@Injectable()
export class AiJobsQueue {
  private readonly logger = new Logger(AiJobsQueue.name);

  constructor(
    @InjectQueue(AI_JOBS_QUEUE) private readonly queue: Queue,
    private readonly aiService: AiServiceClient,
    private readonly transcription: CallTranscriptionService,
    private readonly config: ConfigService,
  ) {}

  async enqueueSourceAnalysis(input: AnalyzeSourceJob, delay = 0) {
    if (!this.aiService.enabled) {
      this.logger.warn(
        `AI source analysis was not queued: automation is disabled, source=${input.sourceType}:${input.sourceId}`,
      );
      return { queued: false };
    }
    return this.enqueue(
      AI_ANALYZE_SOURCE_JOB,
      input,
      `source:${input.sourceType}:${input.sourceId}`,
      delay,
    );
  }

  async enqueueMessageAnalysis(input: {
    organizationId: string;
    messageId: string;
  }) {
    return this.enqueueSourceAnalysis(
      {
        organizationId: input.organizationId,
        sourceType: 'USER_MESSAGE',
        sourceId: input.messageId,
      },
      this.config.get<number>('aiService.messageAnalysisDelayMs', 1_500),
    );
  }

  async enqueueActionRefinement(input: RefineActionJob) {
    if (!this.aiService.enabled) return { queued: false };
    return this.enqueue(
      AI_REFINE_ACTION_JOB,
      input,
      `refine:${input.proposalId}:${input.questionId}:${input.answer}`,
    );
  }

  async enqueueAgentSync(event: AgentSyncEvent) {
    if (!this.aiService.enabled) return { queued: false };
    return this.enqueue(AI_SYNC_AGENT_JOB, event, event.eventId);
  }

  async enqueueCallTranscription(input: TranscribeCallJob) {
    if (!this.aiService.enabled || !this.transcription.enabled) {
      return { queued: false };
    }
    return this.enqueue(
      AI_TRANSCRIBE_CALL_JOB,
      input,
      `call-transcript:${input.recordingId}`,
    );
  }

  private async enqueue(
    name: string,
    data: object,
    idempotencyKey: string,
    delay = 0,
  ) {
    const job = await this.queue.add(name, data, {
      jobId: crypto.createHash('sha256').update(idempotencyKey).digest('hex'),
      ...(delay > 0 ? { delay } : {}),
      attempts: 6,
      backoff: { type: 'exponential', delay: 5_000 },
      removeOnComplete: { age: 86_400, count: 10_000 },
      removeOnFail: { age: 604_800, count: 10_000 },
    });
    const state = await job.getState();
    this.logger.log(
      `AI job accepted: name=${name}, id=${String(job.id)}, state=${state}`,
    );
    if (state === 'failed') {
      this.logger.warn(
        `Retrying previously failed AI job: name=${name}, id=${String(job.id)}`,
      );
      await job.retry();
    }
    return { queued: true, jobId: String(job.id) };
  }
}
