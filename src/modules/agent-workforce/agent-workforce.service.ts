import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AgentActivityStatus } from '../../common/enums/agent-activity.enum';
import { AgentStatus } from '../../common/enums/agent-status.enum';
import { AgentsService } from '../agents/agents.service';
import { AgentActivityService } from '../ai-telemetry/agent-activity.service';
import { AgentWorkforceRepository } from './agent-workforce.repository';
import { OrganizationAgentSettingsService } from '../organization-agent-settings/organization-agent-settings.service';
import { GetAgentWorkforceQueryDto } from './dto/get-agent-workforce-query.dto';
import { UpdateOrganizationAgentSettingDto } from './dto/update-organization-agent-setting.dto';
import { AuditLogsService } from '../audit-logs/audit-logs.service';

const MAX_ANALYTICS_RANGE_MS = 90 * 24 * 60 * 60 * 1000;

type CatalogAgent = Record<string, unknown> & { _id?: unknown; id?: unknown };

@Injectable()
export class AgentWorkforceService {
  constructor(
    private readonly agents: AgentsService,
    private readonly activities: AgentActivityService,
    private readonly repository: AgentWorkforceRepository,
    private readonly settings: OrganizationAgentSettingsService,
    private readonly auditLogs: AuditLogsService,
  ) {}

  async dashboard(
    organizationId: string,
    query: GetAgentWorkforceQueryDto,
    now = new Date(),
  ) {
    const range = this.range(query, now);
    const catalog = await this.agents.list({
      page: query.page,
      limit: query.limit,
      status: AgentStatus.ACTIVE,
    });
    const catalogItems = catalog.items as CatalogAgent[];
    const agentIds = catalogItems.map((agent) => this.agentId(agent));
    const runningFreshSince = new Date(
      now.getTime() - query.runningFreshnessMinutes * 60_000,
    );
    const [settings, activityRows, proposalRows, taskRows] = await Promise.all([
      this.settings.list(organizationId, agentIds),
      this.activities.agentSummaries(
        organizationId,
        agentIds,
        range,
        runningFreshSince,
      ),
      this.repository.proposalMetrics(organizationId, agentIds, range),
      this.repository.taskMetrics(organizationId, agentIds, range),
    ]);
    const settingByAgent = new Map(
      settings.map((setting) => [setting.agentId, setting]),
    );
    const activityByAgent = new Map(
      activityRows.map((activity) => [activity.agentId, activity]),
    );
    const proposalByAgent = new Map(
      proposalRows.map((proposal) => [proposal.agentId, proposal]),
    );
    const taskByAgent = new Map(taskRows.map((task) => [task.agentId, task]));

    const items = catalogItems.map((catalogAgent) => {
      const id = this.agentId(catalogAgent);
      const setting = settingByAgent.get(id);
      const activity = activityByAgent.get(id);
      const proposals = proposalByAgent.get(id);
      const tasks = taskByAgent.get(id);
      const enabled = setting?.enabled ?? true;
      const concurrencyLimit = setting?.concurrencyLimit ?? null;
      const runningJobs = activity?.running || 0;
      const completedRuns =
        (activity?.succeeded || 0) + (activity?.failed || 0);
      const { _id, nameKey, disabledAt, __v, ...publicAgent } = catalogAgent;
      void _id;
      void nameKey;
      void disabledAt;
      void __v;

      return {
        ...publicAgent,
        id,
        organizationSettings: {
          enabled,
          approvalRequired: setting?.approvalRequired ?? true,
          concurrencyLimit,
          configured: Boolean(setting),
        },
        runtime: {
          status: this.runtimeStatus(enabled, activity),
          latestStatus: activity?.latestStatus || null,
          latestActivityAt: activity?.latestActivityAt || null,
          runningJobs,
          staleStartedJobs: activity?.staleStarted || 0,
          runningFreshnessMinutes: query.runningFreshnessMinutes,
        },
        capacity: {
          availability: concurrencyLimit ? 'AVAILABLE' : 'UNAVAILABLE',
          concurrencyLimit,
          runningJobs,
          utilizationPercent: concurrencyLimit
            ? Number(((runningJobs / concurrencyLimit) * 100).toFixed(2))
            : null,
          queuedJobs: this.unavailable('AI_QUEUE_TELEMETRY_NOT_PROVIDED'),
          retryingJobs: this.unavailable(
            'AI_RETRY_STATE_TELEMETRY_NOT_PROVIDED',
          ),
        },
        performance: {
          jobsRun: activity?.totalRuns || 0,
          succeededJobs: activity?.succeeded || 0,
          failedJobs: activity?.failed || 0,
          skippedJobs: activity?.skipped || 0,
          retryAttempts: activity?.retryAttempts || 0,
          averageProcessingTimeMs: activity?.averageProcessingTimeMs ?? null,
          successRatePercent: completedRuns
            ? Number(
                (((activity?.succeeded || 0) / completedRuns) * 100).toFixed(2),
              )
            : null,
          proposals: {
            total: proposals?.total || 0,
            approved: proposals?.approved || 0,
            rejected: proposals?.rejected || 0,
            executed: proposals?.executed || 0,
            failed: proposals?.failed || 0,
          },
          tasks: {
            created: tasks?.created || 0,
            completed: tasks?.completed || 0,
          },
        },
        compliance: this.unavailable(
          'AGENT_COMPLIANCE_METHODOLOGY_NOT_CONFIGURED',
        ),
        revenueAttribution: this.unavailable(
          'AGENT_REVENUE_ATTRIBUTION_NOT_IMPLEMENTED',
        ),
      };
    });

    const configuredItems = items.filter(
      (item) => item.organizationSettings.concurrencyLimit !== null,
    );
    const configuredCapacity = configuredItems.reduce(
      (sum, item) =>
        sum + (item.organizationSettings.concurrencyLimit as number),
      0,
    );
    const configuredRunning = configuredItems.reduce(
      (sum, item) => sum + item.runtime.runningJobs,
      0,
    );

    return {
      range: {
        from: range.from.toISOString(),
        to: range.to.toISOString(),
      },
      measuredAt: now.toISOString(),
      summary: {
        agentsOnPage: items.length,
        enabledAgents: items.filter((item) => item.organizationSettings.enabled)
          .length,
        workingAgents: items.filter((item) => item.runtime.status === 'WORKING')
          .length,
        totalJobsRun: items.reduce(
          (sum, item) => sum + item.performance.jobsRun,
          0,
        ),
        capacity: {
          availability:
            configuredItems.length === 0
              ? 'UNAVAILABLE'
              : configuredItems.length === items.length
                ? 'AVAILABLE'
                : 'PARTIAL',
          configuredAgents: configuredItems.length,
          configuredConcurrency: configuredCapacity || null,
          runningJobs: configuredRunning,
          utilizationPercent: configuredCapacity
            ? Number(
                ((configuredRunning / configuredCapacity) * 100).toFixed(2),
              )
            : null,
          queuedJobs: this.unavailable('AI_QUEUE_TELEMETRY_NOT_PROVIDED'),
          retryingJobs: this.unavailable(
            'AI_RETRY_STATE_TELEMETRY_NOT_PROVIDED',
          ),
        },
      },
      items,
      total: catalog.total,
      page: catalog.page,
      limit: catalog.limit,
      pages: catalog.pages,
    };
  }

  async listSettings(organizationId: string) {
    const settings = await this.settings.list(organizationId);
    return {
      defaults: {
        enabled: true,
        approvalRequired: true,
        concurrencyLimit: null,
      },
      items: settings.map((setting) => this.settingResponse(setting)),
    };
  }

  async updateSetting(
    organizationId: string,
    userId: string,
    agentId: string,
    input: UpdateOrganizationAgentSettingDto,
  ) {
    if (!Object.keys(input).length) {
      throw new BadRequestException('At least one setting must be provided');
    }
    const setting = await this.settings.update(
      organizationId,
      agentId,
      userId,
      input,
    );
    if (!setting) throw new NotFoundException('Agent setting not found');
    await this.auditLogs.create({
      organizationId,
      userId,
      action: 'ORGANIZATION_AGENT_SETTING_UPDATED',
      resourceType: 'AGENT',
      resourceId: agentId,
      metadata: { changedFields: Object.keys(input).sort() },
    });
    return this.settingResponse(setting);
  }

  private range(query: GetAgentWorkforceQueryDto, now: Date) {
    const to = query.to ? new Date(query.to) : now;
    const from = query.from
      ? new Date(query.from)
      : new Date(to.getTime() - 24 * 60 * 60 * 1000);
    if (
      Number.isNaN(from.getTime()) ||
      Number.isNaN(to.getTime()) ||
      from >= to
    ) {
      throw new BadRequestException('from must be before to');
    }
    if (to.getTime() - from.getTime() > MAX_ANALYTICS_RANGE_MS) {
      throw new BadRequestException(
        'Agent workforce analytics range cannot exceed 90 days',
      );
    }
    return { from, to };
  }

  private runtimeStatus(
    enabled: boolean,
    activity:
      | {
          running: number;
          latestStatus: AgentActivityStatus;
        }
      | undefined,
  ) {
    if (!enabled) return 'DISABLED';
    if (activity?.running) return 'WORKING';
    if (!activity) return 'NO_DATA';
    return activity.latestStatus === AgentActivityStatus.FAILED
      ? 'FAILED'
      : 'HEALTHY';
  }

  private unavailable(reason: string) {
    return { availability: 'UNAVAILABLE', value: null, reason };
  }

  private agentId(agent: CatalogAgent) {
    return String(agent.id || agent._id || '');
  }

  private settingResponse(setting: Record<string, unknown>) {
    const { _id, __v, organizationId, ...publicSetting } = setting;
    void __v;
    void organizationId;
    return { id: String(_id), ...publicSetting };
  }
}
