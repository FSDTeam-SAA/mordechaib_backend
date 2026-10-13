import { AgentActivityStatus } from '../../common/enums/agent-activity.enum';
import { AgentsService } from '../agents/agents.service';
import { AgentActivityService } from '../ai-telemetry/agent-activity.service';
import { OrganizationAgentSettingsService } from '../organization-agent-settings/organization-agent-settings.service';
import { AgentWorkforceRepository } from './agent-workforce.repository';
import { AgentWorkforceService } from './agent-workforce.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';

describe('AgentWorkforceService', () => {
  it('combines measured telemetry with tenant settings without inventing queue data', async () => {
    const agents = {
      list: jest.fn().mockResolvedValue({
        items: [
          {
            _id: 'agent-1',
            name: 'Steve',
            type: 'SALES',
            status: 'ACTIVE',
          },
        ],
        total: 1,
        page: 1,
        limit: 20,
        pages: 1,
      }),
    };
    const activities = {
      agentSummaries: jest.fn().mockResolvedValue([
        {
          agentId: 'agent-1',
          totalRuns: 10,
          succeeded: 8,
          failed: 2,
          skipped: 0,
          running: 1,
          staleStarted: 0,
          retryAttempts: 1,
          averageProcessingTimeMs: 1200,
          latestStatus: AgentActivityStatus.STARTED,
          latestActivityAt: new Date('2026-10-13T05:59:00.000Z'),
        },
      ]),
    };
    const repository = {
      proposalMetrics: jest.fn().mockResolvedValue([
        {
          agentId: 'agent-1',
          total: 4,
          approved: 3,
          rejected: 1,
          executed: 2,
          failed: 0,
        },
      ]),
      taskMetrics: jest
        .fn()
        .mockResolvedValue([{ agentId: 'agent-1', created: 2, completed: 1 }]),
    };
    const settings = {
      list: jest.fn().mockResolvedValue([
        {
          agentId: 'agent-1',
          enabled: true,
          approvalRequired: true,
          concurrencyLimit: 4,
        },
      ]),
    };
    const service = new AgentWorkforceService(
      agents as unknown as AgentsService,
      activities as unknown as AgentActivityService,
      repository as unknown as AgentWorkforceRepository,
      settings as unknown as OrganizationAgentSettingsService,
      {} as AuditLogsService,
    );

    const result = await service.dashboard(
      'org-1',
      {
        page: 1,
        limit: 20,
        runningFreshnessMinutes: 60,
      },
      new Date('2026-10-13T06:00:00.000Z'),
    );

    expect(result.items[0]).toEqual(
      expect.objectContaining({
        runtime: expect.objectContaining({
          status: 'WORKING',
          runningJobs: 1,
        }),
        capacity: expect.objectContaining({
          availability: 'AVAILABLE',
          utilizationPercent: 25,
          queuedJobs: expect.objectContaining({
            availability: 'UNAVAILABLE',
          }),
        }),
        performance: expect.objectContaining({
          jobsRun: 10,
          successRatePercent: 80,
          averageProcessingTimeMs: 1200,
          tasks: { created: 2, completed: 1 },
        }),
      }),
    );
  });
});
