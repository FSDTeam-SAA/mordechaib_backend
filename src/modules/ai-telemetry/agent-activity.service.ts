import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  AgentActivityStatus,
  AgentOperationType,
} from '../../common/enums/agent-activity.enum';
import { AgentType } from '../../common/enums/agent-type.enum';
import { AgentActivity } from '../../database/schemas/agent-activity.schema';

type StartActivityInput = {
  organizationId: string;
  operationType: AgentOperationType;
  jobId: string;
  attempt: number;
  sourceType?: string;
  sourceId?: string;
  agent?: { id: string; name: string; type: AgentType };
  runId?: string;
  metadata?: Record<string, unknown>;
};

type FinishActivityInput = {
  agent?: { id: string; name: string; type: AgentType };
  runId?: string;
  metadata?: Record<string, unknown>;
  failureCode?: string;
  failureMessage?: string;
};

@Injectable()
export class AgentActivityService {
  private readonly logger = new Logger(AgentActivityService.name);

  constructor(
    @InjectModel(AgentActivity.name)
    private readonly activities: Model<AgentActivity>,
  ) {}

  async start(input: StartActivityInput): Promise<string | undefined> {
    try {
      const activity = await this.activities
        .findOneAndUpdate(
          {
            organizationId: input.organizationId,
            jobId: input.jobId,
            attempt: input.attempt,
          },
          {
            $setOnInsert: {
              ...input,
              status: AgentActivityStatus.STARTED,
              startedAt: new Date(),
            },
          },
          { new: true, upsert: true, runValidators: true },
        )
        .lean()
        .exec();
      return activity ? String(activity._id) : undefined;
    } catch (error) {
      this.warn('start', error);
      return undefined;
    }
  }

  succeed(activityId: string | undefined, input: FinishActivityInput = {}) {
    return this.finish(activityId, AgentActivityStatus.SUCCEEDED, input);
  }

  skip(activityId: string | undefined, input: FinishActivityInput = {}) {
    return this.finish(activityId, AgentActivityStatus.SKIPPED, input);
  }

  fail(activityId: string | undefined, input: FinishActivityInput = {}) {
    return this.finish(activityId, AgentActivityStatus.FAILED, input);
  }

  async list(
    organizationId: string,
    range: { from: Date; to: Date },
    limit: number,
  ) {
    return this.activities
      .find({
        organizationId,
        startedAt: { $gte: range.from, $lt: range.to },
      })
      .sort({ startedAt: -1, _id: -1 })
      .limit(limit)
      .lean()
      .exec();
  }

  async healthSnapshot(
    organizationId: string,
    range: { from: Date; to: Date },
  ) {
    const rowLimit = 10_000;
    const queriedRows = await this.activities
      .find({
        organizationId,
        startedAt: { $gte: range.from, $lt: range.to },
      })
      .select('status operationType latencyMs completedAt startedAt')
      .sort({ startedAt: -1, _id: -1 })
      .limit(rowLimit + 1)
      .lean()
      .exec();
    const truncated = queriedRows.length > rowLimit;
    const rows = queriedRows.slice(0, rowLimit);
    const completed = rows.filter((row) =>
      [AgentActivityStatus.SUCCEEDED, AgentActivityStatus.FAILED].includes(
        row.status,
      ),
    );
    const succeeded = completed.filter(
      (row) => row.status === AgentActivityStatus.SUCCEEDED,
    ).length;
    const failed = completed.length - succeeded;
    const latencies = completed
      .map((row) => row.latencyMs)
      .filter((value): value is number => typeof value === 'number')
      .sort((left, right) => left - right);
    const operationCounts = rows.reduce<Record<string, number>>(
      (result, row) => {
        result[row.operationType] = (result[row.operationType] || 0) + 1;
        return result;
      },
      {},
    );
    return {
      from: range.from.toISOString(),
      to: range.to.toISOString(),
      totalRuns: rows.length,
      completedRuns: completed.length,
      succeeded,
      failed,
      running: rows.filter((row) => row.status === AgentActivityStatus.STARTED)
        .length,
      skipped: rows.filter((row) => row.status === AgentActivityStatus.SKIPPED)
        .length,
      successRatePercent: completed.length
        ? Number(((succeeded / completed.length) * 100).toFixed(2))
        : null,
      averageLatencyMs: latencies.length
        ? Math.round(
            latencies.reduce((sum, value) => sum + value, 0) / latencies.length,
          )
        : null,
      p95LatencyMs: latencies.length
        ? latencies[
            Math.min(
              Math.ceil(latencies.length * 0.95) - 1,
              latencies.length - 1,
            )
          ]
        : null,
      operationCounts,
      truncated,
    };
  }

  /**
   * Returns only telemetry measured by this backend. Queue depth and active
   * retries are intentionally excluded because the AI service does not yet
   * publish those dimensions per agent.
   */
  agentSummaries(
    organizationId: string,
    agentIds: string[],
    range: { from: Date; to: Date },
    runningFreshSince: Date,
  ) {
    if (!agentIds.length) return Promise.resolve([]);
    return this.activities
      .aggregate<{
        agentId: string;
        totalRuns: number;
        succeeded: number;
        failed: number;
        skipped: number;
        running: number;
        staleStarted: number;
        retryAttempts: number;
        averageProcessingTimeMs: number | null;
        latestStatus: AgentActivityStatus;
        latestActivityAt: Date;
      }>([
        {
          $match: {
            organizationId,
            agentId: { $in: agentIds },
            startedAt: { $gte: range.from, $lt: range.to },
          },
        },
        { $sort: { startedAt: -1 } },
        {
          $group: {
            _id: '$agentId',
            latestStatus: { $first: '$status' },
            latestActivityAt: { $first: '$startedAt' },
            totalRuns: { $sum: 1 },
            succeeded: {
              $sum: {
                $cond: [
                  { $eq: ['$status', AgentActivityStatus.SUCCEEDED] },
                  1,
                  0,
                ],
              },
            },
            failed: {
              $sum: {
                $cond: [{ $eq: ['$status', AgentActivityStatus.FAILED] }, 1, 0],
              },
            },
            skipped: {
              $sum: {
                $cond: [
                  { $eq: ['$status', AgentActivityStatus.SKIPPED] },
                  1,
                  0,
                ],
              },
            },
            running: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      { $eq: ['$status', AgentActivityStatus.STARTED] },
                      { $gte: ['$startedAt', runningFreshSince] },
                    ],
                  },
                  1,
                  0,
                ],
              },
            },
            staleStarted: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      { $eq: ['$status', AgentActivityStatus.STARTED] },
                      { $lt: ['$startedAt', runningFreshSince] },
                    ],
                  },
                  1,
                  0,
                ],
              },
            },
            retryAttempts: {
              $sum: { $cond: [{ $gt: ['$attempt', 1] }, 1, 0] },
            },
            averageProcessingTimeMs: {
              $avg: {
                $cond: [
                  {
                    $in: [
                      '$status',
                      [
                        AgentActivityStatus.SUCCEEDED,
                        AgentActivityStatus.FAILED,
                        AgentActivityStatus.SKIPPED,
                      ],
                    ],
                  },
                  '$latencyMs',
                  null,
                ],
              },
            },
          },
        },
        {
          $project: {
            _id: 0,
            agentId: '$_id',
            totalRuns: 1,
            succeeded: 1,
            failed: 1,
            skipped: 1,
            running: 1,
            staleStarted: 1,
            retryAttempts: 1,
            latestStatus: 1,
            latestActivityAt: 1,
            averageProcessingTimeMs: {
              $cond: [
                { $eq: ['$averageProcessingTimeMs', null] },
                null,
                { $round: ['$averageProcessingTimeMs', 0] },
              ],
            },
          },
        },
      ])
      .exec();
  }

  private async finish(
    activityId: string | undefined,
    status: AgentActivityStatus,
    input: FinishActivityInput,
  ) {
    if (!activityId) return undefined;
    try {
      const activity = await this.activities.findById(activityId).lean().exec();
      if (!activity || activity.status !== AgentActivityStatus.STARTED) {
        return activity || undefined;
      }
      const completedAt = new Date();
      return await this.activities
        .findOneAndUpdate(
          { _id: activityId, status: AgentActivityStatus.STARTED },
          {
            $set: {
              status,
              completedAt,
              latencyMs: Math.max(
                0,
                completedAt.getTime() - new Date(activity.startedAt).getTime(),
              ),
              ...(input.agent
                ? {
                    agentId: input.agent.id,
                    agentName: input.agent.name,
                    agentType: input.agent.type,
                  }
                : {}),
              ...(input.runId ? { runId: input.runId } : {}),
              ...(input.metadata ? { metadata: input.metadata } : {}),
              ...(input.failureCode
                ? { failureCode: input.failureCode.slice(0, 100) }
                : {}),
              ...(input.failureMessage
                ? { failureMessage: input.failureMessage.slice(0, 1_000) }
                : {}),
            },
          },
          { new: true, runValidators: true },
        )
        .lean()
        .exec();
    } catch (error) {
      this.warn('finish', error);
      return undefined;
    }
  }

  private warn(operation: string, error: unknown) {
    this.logger.warn(
      `Unable to ${operation} AI activity telemetry: ${
        error instanceof Error ? error.message : 'unknown error'
      }`,
    );
  }
}
