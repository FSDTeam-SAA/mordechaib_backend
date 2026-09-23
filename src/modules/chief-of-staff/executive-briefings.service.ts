import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { isValidObjectId } from 'mongoose';
import {
  ExecutiveBriefingStatus,
  ExecutiveBriefingType,
} from '../../common/enums/executive-briefing.enum';
import { UserRole } from '../../common/enums/user-role.enum';
import { GenerateExecutiveBriefingDto } from './dto/generate-executive-briefing.dto';
import { ExecutiveBriefingFactsService } from './executive-briefing-facts.service';
import { ExecutiveBriefingsQueue } from './executive-briefings.queue';
import { ExecutiveBriefingsRepository } from './executive-briefings.repository';

@Injectable()
export class ExecutiveBriefingsService {
  constructor(
    private readonly facts: ExecutiveBriefingFactsService,
    private readonly repository: ExecutiveBriefingsRepository,
    private readonly queue: ExecutiveBriefingsQueue,
    private readonly config: ConfigService,
  ) {}

  async generate(
    organizationId: string,
    requesterUserId: string,
    type: ExecutiveBriefingType,
    input: GenerateExecutiveBriefingDto = {},
  ) {
    const prepared = await this.facts.prepare(
      organizationId,
      requesterUserId,
      type,
      input.asOf ? new Date(input.asOf) : new Date(),
    );
    const reserved = await this.repository.reserve({
      organizationId,
      requesterUserId,
      requesterScopeHash: prepared.requesterScopeHash,
      briefingType: type,
      inputHash: prepared.inputHash,
      input: prepared.input,
    });
    if (!reserved.record) {
      throw new Error('Executive briefing could not be reserved');
    }
    const briefingId = String(reserved.record._id);
    const shouldQueue =
      reserved.created ||
      reserved.record.status === ExecutiveBriefingStatus.QUEUED ||
      (reserved.record.status === ExecutiveBriefingStatus.FAILED &&
        reserved.record.failureRetryable === true);
    if (shouldQueue) {
      if (reserved.record.status === ExecutiveBriefingStatus.FAILED) {
        await this.repository.requeueFailed(organizationId, briefingId);
      }
      let queued: Awaited<ReturnType<ExecutiveBriefingsQueue['enqueue']>>;
      try {
        queued = await this.queue.enqueue(
          { organizationId, briefingId },
          prepared.input.idempotencyKey,
        );
      } catch (error) {
        await this.repository.markFailed(organizationId, briefingId, {
          code: 'BRIEFING_QUEUE_UNAVAILABLE',
          message: (error instanceof Error
            ? error.message
            : 'Executive briefing queue is unavailable'
          ).slice(0, 2_000),
          retryable: true,
        });
        return {
          briefingId,
          status: ExecutiveBriefingStatus.FAILED,
          failureCode: 'BRIEFING_QUEUE_UNAVAILABLE',
          retryable: true,
        };
      }
      if (!queued.queued) {
        await this.repository.markFailed(organizationId, briefingId, {
          code: 'AI_AUTOMATION_DISABLED',
          message: 'AI service automation is disabled',
          retryable: false,
        });
        return {
          briefingId,
          status: ExecutiveBriefingStatus.FAILED,
          failureCode: 'AI_AUTOMATION_DISABLED',
          retryable: false,
        };
      }
    }
    return {
      briefingId,
      status: shouldQueue
        ? ExecutiveBriefingStatus.QUEUED
        : reserved.record.status,
      pollAfterMs: this.config.get<number>(
        'aiService.briefingPollAfterMs',
        2_000,
      ),
      duplicate: !reserved.created,
    };
  }

  async getLatest(
    organizationId: string,
    requesterUserId: string,
    requesterRole: UserRole,
    type: ExecutiveBriefingType,
    asOf?: string,
  ) {
    const instant = asOf ? new Date(asOf) : new Date();
    if (Number.isNaN(instant.getTime())) {
      throw new BadRequestException('asOf must be a valid ISO timestamp');
    }
    const record = await this.repository.findLatestForPeriod(
      organizationId,
      requesterUserId,
      this.facts.scopeHash(organizationId, requesterUserId, requesterRole),
      type,
      instant,
    );
    if (!record) throw new NotFoundException('Executive briefing not found');
    return this.toResponse(record as unknown as Record<string, unknown>);
  }

  async getById(
    organizationId: string,
    requesterUserId: string,
    requesterRole: UserRole,
    briefingId: string,
  ) {
    if (!isValidObjectId(briefingId)) {
      throw new BadRequestException('Invalid executive briefing id');
    }
    const record = await this.repository.findByIdForRequester(
      organizationId,
      requesterUserId,
      this.facts.scopeHash(organizationId, requesterUserId, requesterRole),
      briefingId,
    );
    if (!record) throw new NotFoundException('Executive briefing not found');
    return this.toResponse(record as unknown as Record<string, unknown>);
  }

  private toResponse(record: Record<string, unknown>) {
    const status = record.status as ExecutiveBriefingStatus;
    return {
      id: String(record._id),
      briefingType: record.briefingType,
      period: record.period,
      status,
      attemptCount: record.attemptCount,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      completedAt: record.completedAt,
      ...(status === ExecutiveBriefingStatus.READY
        ? { content: record.content }
        : {}),
      ...(status === ExecutiveBriefingStatus.FAILED
        ? {
            failure: {
              code: record.failureCode,
              message: record.failureMessage,
              retryable: record.failureRetryable === true,
            },
          }
        : {
            pollAfterMs: this.config.get<number>(
              'aiService.briefingPollAfterMs',
              2_000,
            ),
          }),
    };
  }
}
