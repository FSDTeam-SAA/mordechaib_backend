import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';

export const TWILIO_PROVISIONING_QUEUE = 'twilio-provisioning';
export const PROVISION_TWILIO_JOB = 'provision-twilio';
export const CLOSE_TWILIO_CONNECTION_JOB = 'close-twilio-connection';
export const BILL_TWILIO_OVERAGE_JOB = 'bill-twilio-overage';

export type TwilioOrganizationJob = {
  organizationId: string;
  operationId: string;
};
export type TwilioOverageJob = { callSid: string };

@Injectable()
export class TwilioProvisioningQueue {
  constructor(
    @InjectQueue(TWILIO_PROVISIONING_QUEUE) private readonly queue: Queue,
  ) {}

  enqueueProvisioning(organizationId: string, operationId: string) {
    return this.enqueue(PROVISION_TWILIO_JOB, organizationId, operationId);
  }

  enqueueClosure(organizationId: string, operationId: string, delay = 0) {
    return this.enqueue(
      CLOSE_TWILIO_CONNECTION_JOB,
      organizationId,
      operationId,
      delay,
    );
  }

  async enqueueOverageBilling(callSid: string) {
    const job = await this.queue.add(
      BILL_TWILIO_OVERAGE_JOB,
      { callSid } satisfies TwilioOverageJob,
      {
        jobId: `bill-twilio-overage-${callSid}`,
        attempts: 10,
        backoff: { type: 'exponential', delay: 5_000 },
        removeOnComplete: { age: 604_800, count: 10_000 },
        removeOnFail: { age: 2_592_000, count: 10_000 },
      },
    );
    if ((await job.getState()) === 'failed') await job.retry();
    return job;
  }

  private async enqueue(
    name: string,
    organizationId: string,
    operationId: string,
    delay = 0,
  ) {
    const job = await this.queue.add(
      name,
      { organizationId, operationId } satisfies TwilioOrganizationJob,
      {
        jobId: `${name}-${organizationId}-${operationId}`,
        attempts: 8,
        delay,
        backoff: { type: 'exponential', delay: 2_000 },
        removeOnComplete: { age: 86_400, count: 1_000 },
        removeOnFail: { age: 604_800, count: 5_000 },
      },
    );
    if ((await job.getState()) === 'failed') await job.retry();
    return job;
  }
}
