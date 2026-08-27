import { Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job, UnrecoverableError } from 'bullmq';
import {
  CREATE_MEETING_BOT_JOB,
  CreateMeetingBotJob,
  PROCESS_RECALL_WEBHOOK_JOB,
  ProcessRecallWebhookJob,
  RECALL_MEETINGS_QUEUE,
} from './meeting-bots.queue';
import { MeetingBotsService } from './meeting-bots.service';
import { RecallApiError } from './providers/recall.types';

@Processor(RECALL_MEETINGS_QUEUE, { concurrency: 10 })
export class MeetingBotsProcessor extends WorkerHost {
  private readonly logger = new Logger(MeetingBotsProcessor.name);

  constructor(private readonly meetings: MeetingBotsService) {
    super();
  }

  async process(job: Job) {
    switch (job.name) {
      case CREATE_MEETING_BOT_JOB:
        return this.createBot(job as Job<CreateMeetingBotJob>);
      case PROCESS_RECALL_WEBHOOK_JOB:
        return this.processWebhook(job as Job<ProcessRecallWebhookJob>);
      default:
        throw new UnrecoverableError(
          `Unsupported meeting bot queue job: ${job.name}`,
        );
    }
  }

  private async createBot(job: Job<CreateMeetingBotJob>) {
    try {
      await this.meetings.processBotCreation(job.data.meetingId);
    } catch (error) {
      const finalAttempt =
        job.attemptsMade + 1 >= Number(job.opts.attempts || 1);
      const retryable =
        error instanceof RecallApiError ? error.retryable : false;
      if (!retryable || finalAttempt) {
        await this.meetings.markBotCreationFailed(job.data.meetingId, error);
      }
      this.logger.error(
        `Meeting bot creation failed for ${job.data.meetingId} on attempt ${job.attemptsMade + 1}`,
        error instanceof Error ? error.stack : undefined,
      );
      if (!retryable) {
        throw new UnrecoverableError(
          error instanceof Error
            ? error.message
            : 'Meeting bot creation failed',
        );
      }
      throw error;
    }
  }

  private async processWebhook(job: Job<ProcessRecallWebhookJob>) {
    try {
      await this.meetings.processWebhook(job.data.eventId, job.data.payload);
    } catch (error) {
      this.logger.error(
        `Recall webhook processing failed for ${job.data.eventId} on attempt ${job.attemptsMade + 1}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw error;
    }
  }
}
