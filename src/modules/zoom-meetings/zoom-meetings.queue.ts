import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import crypto from 'crypto';
import { RecallWebhookPayload } from './providers/recall-zoom.provider';

export const RECALL_ZOOM_QUEUE = 'recall-zoom';
export const CREATE_ZOOM_BOT_JOB = 'create-zoom-bot';
export const PROCESS_RECALL_WEBHOOK_JOB = 'process-recall-webhook';

export type CreateZoomBotJob = { meetingId: string };
export type ProcessRecallWebhookJob = {
  eventId: string;
  payload: RecallWebhookPayload;
};

@Injectable()
export class ZoomMeetingsQueue {
  constructor(@InjectQueue(RECALL_ZOOM_QUEUE) private readonly queue: Queue) {}

  enqueueBotCreation(meetingId: string) {
    return this.queue.add(
      CREATE_ZOOM_BOT_JOB,
      { meetingId } satisfies CreateZoomBotJob,
      {
        jobId: `create-${meetingId}`,
        attempts: 10,
        backoff: { type: 'fixed', delay: 30_000 },
        removeOnComplete: { age: 86_400, count: 1_000 },
        removeOnFail: { age: 604_800, count: 5_000 },
      },
    );
  }

  async enqueueWebhook(eventId: string, payload: RecallWebhookPayload) {
    const job = await this.queue.add(
      PROCESS_RECALL_WEBHOOK_JOB,
      { eventId, payload } satisfies ProcessRecallWebhookJob,
      {
        jobId: `webhook-${crypto.createHash('sha256').update(eventId).digest('hex')}`,
        attempts: 8,
        backoff: { type: 'exponential', delay: 2_000 },
        removeOnComplete: { age: 86_400, count: 10_000 },
        removeOnFail: { age: 604_800, count: 10_000 },
      },
    );
    if ((await job.getState()) === 'failed') await job.retry();
    return job;
  }
}
