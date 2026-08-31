import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import crypto from 'crypto';
import { RecallWebhookPayload } from './providers/recall.types';

export const RECALL_MEETINGS_QUEUE = 'recall-meetings';
export const CREATE_MEETING_BOT_JOB = 'create-meeting-bot';
export const PROCESS_RECALL_WEBHOOK_JOB = 'process-recall-webhook';

export type CreateMeetingBotJob = { meetingId: string };
export type ProcessRecallWebhookJob = {
  eventId: string;
  payload: RecallWebhookPayload;
};

@Injectable()
export class MeetingBotsQueue {
  constructor(
    @InjectQueue(RECALL_MEETINGS_QUEUE) private readonly queue: Queue,
  ) {}

  enqueueBotCreation(meetingId: string) {
    return this.queue.add(
      CREATE_MEETING_BOT_JOB,
      { meetingId } satisfies CreateMeetingBotJob,
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
    const eventHash = crypto.createHash('sha256').update(eventId).digest('hex');
    const job = await this.queue.add(
      PROCESS_RECALL_WEBHOOK_JOB,
      { eventId, payload } satisfies ProcessRecallWebhookJob,
      {
        jobId: `webhook-${eventHash}`,
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
