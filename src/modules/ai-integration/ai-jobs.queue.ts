import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import crypto from 'crypto';
import { Queue } from 'bullmq';
import { AiServiceClient } from './ai-service.client';
import { CallTranscriptionService } from './call-transcription.service';

export const AI_JOBS_QUEUE = 'ai-jobs';
export const AI_ANALYZE_SOURCE_JOB = 'analyze-source';
export const AI_TRANSCRIBE_CALL_JOB = 'transcribe-call';

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
  constructor(
    @InjectQueue(AI_JOBS_QUEUE) private readonly queue: Queue,
    private readonly aiService: AiServiceClient,
    private readonly transcription: CallTranscriptionService,
    private readonly config: ConfigService,
  ) {}

  async enqueueSourceAnalysis(input: AnalyzeSourceJob, delay = 0) {
    if (!this.aiService.enabled) return { queued: false };
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
    if ((await job.getState()) === 'failed') await job.retry();
    return { queued: true, jobId: String(job.id) };
  }
}
