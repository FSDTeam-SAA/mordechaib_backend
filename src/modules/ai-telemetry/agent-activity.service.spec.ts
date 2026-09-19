import { Model } from 'mongoose';
import {
  AgentActivityStatus,
  AgentOperationType,
} from '../../common/enums/agent-activity.enum';
import { AgentActivity } from '../../database/schemas/agent-activity.schema';
import { AgentActivityService } from './agent-activity.service';

describe('AgentActivityService', () => {
  it('calculates measured runtime health from completed activities', async () => {
    const model = {
      find: jest.fn(() =>
        query([
          {
            status: AgentActivityStatus.SUCCEEDED,
            operationType: AgentOperationType.SOURCE_ANALYSIS,
            latencyMs: 100,
          },
          {
            status: AgentActivityStatus.SUCCEEDED,
            operationType: AgentOperationType.EXECUTIVE_BRIEFING,
            latencyMs: 300,
          },
          {
            status: AgentActivityStatus.FAILED,
            operationType: AgentOperationType.SOURCE_ANALYSIS,
            latencyMs: 200,
          },
          {
            status: AgentActivityStatus.STARTED,
            operationType: AgentOperationType.SOURCE_ANALYSIS,
          },
        ]),
      ),
    } as unknown as Model<AgentActivity>;
    const service = new AgentActivityService(model);

    await expect(
      service.healthSnapshot('org-1', {
        from: new Date('2026-09-17T00:00:00.000Z'),
        to: new Date('2026-09-18T00:00:00.000Z'),
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        totalRuns: 4,
        completedRuns: 3,
        succeeded: 2,
        failed: 1,
        running: 1,
        successRatePercent: 66.67,
        averageLatencyMs: 200,
        p95LatencyMs: 300,
        operationCounts: {
          SOURCE_ANALYSIS: 3,
          EXECUTIVE_BRIEFING: 1,
        },
      }),
    );
  });

  it('does not fail the core workflow when telemetry storage fails', async () => {
    const model = {
      findOneAndUpdate: jest.fn(() => queryError(new Error('mongo down'))),
    } as unknown as Model<AgentActivity>;
    const service = new AgentActivityService(model);

    await expect(
      service.start({
        organizationId: 'org-1',
        operationType: AgentOperationType.SOURCE_ANALYSIS,
        jobId: 'job-1',
        attempt: 1,
      }),
    ).resolves.toBeUndefined();
  });

  function query(value: unknown) {
    const chain = {
      select: jest.fn(),
      limit: jest.fn(),
      lean: jest.fn(),
      exec: jest.fn().mockResolvedValue(value),
    };
    chain.select.mockReturnValue(chain);
    chain.limit.mockReturnValue(chain);
    chain.lean.mockReturnValue(chain);
    return chain;
  }

  function queryError(error: Error) {
    const chain = {
      lean: jest.fn(),
      exec: jest.fn().mockRejectedValue(error),
    };
    chain.lean.mockReturnValue(chain);
    return chain;
  }
});
