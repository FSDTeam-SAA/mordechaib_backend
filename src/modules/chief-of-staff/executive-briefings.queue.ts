import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import crypto from 'crypto';
import { Queue } from 'bullmq';
import { AiServiceClient } from '../ai-integration/ai-service.client';

export const EXECUTIVE_BRIEFINGS_QUEUE = 'executive-briefings';
export const GENERATE_EXECUTIVE_BRIEFING_JOB = 'generate-executive-briefing';

export type GenerateExecutiveBriefingJob = {
  organizationId: string;
  briefingId: string;
};

@Injectable()
export class ExecutiveBriefingsQueue {
  private readonly logger = new Logger(ExecutiveBriefingsQueue.name);

  constructor(
    @InjectQueue(EXECUTIVE_BRIEFINGS_QUEUE)
    private readonly queue: Queue,
    private readonly aiService: AiServiceClient,
  ) {}

  async enqueue(input: GenerateExecutiveBriefingJob, idempotencyKey: string) {
    if (!this.aiService.enabled) {
      return { queued: false, reason: 'AI_AUTOMATION_DISABLED' };
    }
    const jobId = crypto
      .createHash('sha256')
      .update(idempotencyKey)
      .digest('hex');
    const existing = await this.queue.getJob(jobId);
    if (existing) {
      const state = await existing.getState();
      if (state === 'failed') await existing.retry();
      this.logger.log(
        `Executive briefing job reused: id=${jobId}, state=${state}`,
      );
      return { queued: true, jobId, duplicate: true };
    }
    await this.queue.add(GENERATE_EXECUTIVE_BRIEFING_JOB, input, {
      jobId,
      attempts: 4,
      backoff: { type: 'exponential', delay: 5_000 },
      removeOnComplete: { age: 86_400, count: 5_000 },
      removeOnFail: { age: 604_800, count: 5_000 },
    });
    this.logger.log(`Executive briefing job queued: id=${jobId}`);
    return { queued: true, jobId, duplicate: false };
  }
}
