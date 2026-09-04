import { Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job, UnrecoverableError } from 'bullmq';
import {
  BILL_TWILIO_OVERAGE_JOB,
  CLOSE_TWILIO_CONNECTION_JOB,
  PROVISION_TWILIO_JOB,
  TWILIO_PROVISIONING_QUEUE,
  TwilioOrganizationJob,
  TwilioOverageJob,
} from './twilio-provisioning.queue';
import { TwilioProvisioningService } from './twilio-provisioning.service';
import { TwilioUsageService } from './twilio-usage.service';

@Processor(TWILIO_PROVISIONING_QUEUE, { concurrency: 5 })
export class TwilioProvisioningProcessor extends WorkerHost {
  private readonly logger = new Logger(TwilioProvisioningProcessor.name);

  constructor(
    private readonly provisioning: TwilioProvisioningService,
    private readonly usage: TwilioUsageService,
  ) {
    super();
  }

  async process(job: Job<TwilioOrganizationJob | TwilioOverageJob>) {
    try {
      switch (job.name) {
        case PROVISION_TWILIO_JOB:
          return await this.provisioning.processProvisioning(
            (job.data as TwilioOrganizationJob).organizationId,
            (job.data as TwilioOrganizationJob).operationId,
          );
        case CLOSE_TWILIO_CONNECTION_JOB:
          return await this.provisioning.processClosure(
            (job.data as TwilioOrganizationJob).organizationId,
            (job.data as TwilioOrganizationJob).operationId,
          );
        case BILL_TWILIO_OVERAGE_JOB:
          return await this.usage.processOverageBilling(
            (job.data as TwilioOverageJob).callSid,
          );
        default:
          throw new UnrecoverableError(
            `Unsupported Twilio provisioning job: ${job.name}`,
          );
      }
    } catch (error) {
      const finalAttempt =
        job.attemptsMade + 1 >= Number(job.opts.attempts || 1);
      this.logger.error(
        `${job.name} failed on attempt ${job.attemptsMade + 1}`,
        error instanceof Error ? error.stack : undefined,
      );
      if (finalAttempt && job.name !== BILL_TWILIO_OVERAGE_JOB) {
        await this.provisioning.markFailed(
          (job.data as TwilioOrganizationJob).organizationId,
          (job.data as TwilioOrganizationJob).operationId,
          error,
        );
      }
      throw error;
    }
  }
}
