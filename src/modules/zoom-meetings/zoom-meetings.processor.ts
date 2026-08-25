import { Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job, UnrecoverableError } from 'bullmq';
import { RecallApiError } from './providers/recall-zoom.provider';
import {
  CREATE_ZOOM_BOT_JOB,
  CreateZoomBotJob,
  PROCESS_RECALL_WEBHOOK_JOB,
  ProcessRecallWebhookJob,
  RECALL_ZOOM_QUEUE,
} from './zoom-meetings.queue';
import { ZoomMeetingsService } from './zoom-meetings.service';

@Processor(RECALL_ZOOM_QUEUE, { concurrency: 10 })
export class ZoomMeetingsProcessor extends WorkerHost {
  private readonly logger = new Logger(ZoomMeetingsProcessor.name);

  constructor(private readonly meetings: ZoomMeetingsService) {
    super();
  }

  async process(job: Job) {
    switch (job.name) {
      case CREATE_ZOOM_BOT_JOB:
        return this.createBot(job as Job<CreateZoomBotJob>);
      case PROCESS_RECALL_WEBHOOK_JOB:
        return this.processWebhook(job as Job<ProcessRecallWebhookJob>);
      default:
        throw new UnrecoverableError(`Unsupported Zoom queue job: ${job.name}`);
    }
  }

  private async createBot(job: Job<CreateZoomBotJob>) {
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
        `Zoom bot creation failed for meeting ${job.data.meetingId} on attempt ${job.attemptsMade + 1}`,
        error instanceof Error ? error.stack : undefined,
      );
      if (!retryable) {
        throw new UnrecoverableError(
          error instanceof Error ? error.message : 'Zoom bot creation failed',
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
