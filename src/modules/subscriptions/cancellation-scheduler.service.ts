import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { CancellationRequestsRepository } from './cancellation-requests.repository';
import { CancellationsService } from './cancellations.service';

@Injectable()
export class CancellationSchedulerService {
  private readonly logger = new Logger(CancellationSchedulerService.name);

  constructor(
    private readonly repository: CancellationRequestsRepository,
    private readonly cancellationsService: CancellationsService,
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  async executeDueCancellations() {
    const due = await this.repository.findDueForExecution(new Date());
    for (const request of due) {
      try {
        await this.cancellationsService.execute(String(request._id), 'CRON');
      } catch (error) {
        // One bad record shouldn't block the rest of the sweep.
        this.logger.error(
          `Failed to execute cancellation ${request._id}`,
          error instanceof Error ? error.stack : error,
        );
      }
    }
  }
}