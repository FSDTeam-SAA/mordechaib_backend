import { Injectable, NotFoundException } from '@nestjs/common';
import { AgentActivityStatus } from '../../common/enums/agent-activity.enum';
import { AgentStatus } from '../../common/enums/agent-status.enum';
import { ExecutiveBriefingType } from '../../common/enums/executive-briefing.enum';
import { TaskStatus } from '../../common/enums/task-status.enum';
import { UserRole } from '../../common/enums/user-role.enum';
import {
  localDateKeys,
  trailingLocalDaysRange,
} from '../../common/helpers/local-date-range.helper';
import {
  AiActionProposalStatus,
  AiProposalSourceType,
} from '../../database/schemas/ai-action-proposal.schema';
import { AgentsService } from '../agents/agents.service';
import { AgentActivityService } from '../ai-telemetry/agent-activity.service';
import { AuthService } from '../auth/auth.service';
import { CallIntelligenceService } from '../call-intelligence/call-intelligence.service';
import { CallIntelligenceItemKind } from '../call-intelligence/dto/list-call-intelligence-query.dto';
import { ExecutiveBriefingsService } from '../chief-of-staff/executive-briefings.service';
import { OrganizationsService } from '../organizations/organizations.service';
import {
  DashboardListQueryDto,
  DashboardSummaryQueryDto,
  DashboardWorkforceQueryDto,
} from './dto/dashboard-list-query.dto';
import {
  OrganizerDashboardRepository,
  ProposalSourceSummary,
} from './organizer-dashboard.repository';

type RecentCallItem = {
  source: { id: string; type: AiProposalSourceType };
  title: string;
  status?: unknown;
  aiStatus?: unknown;
  direction?: unknown;
  fromNumber?: unknown;
  toNumber?: unknown;
  occurredAt?: unknown;
  durationSeconds?: unknown;
  createdAt?: unknown;
  detailsPath: string;
};

@Injectable()
export class OrganizerDashboardService {
  constructor(
    private readonly repository: OrganizerDashboardRepository,
    private readonly agents: AgentsService,
    private readonly activities: AgentActivityService,
    private readonly auth: AuthService,
    private readonly organizations: OrganizationsService,
    private readonly callIntelligence: CallIntelligenceService,
    private readonly briefings: ExecutiveBriefingsService,
  ) {}

  async summary(
    organizationId: string,
    userId: string,
    query: DashboardSummaryQueryDto,
    now = new Date(),
  ) {
    const [profile, organization] = await Promise.all([
      this.auth.getMe(userId),
      this.organizations.findCurrent(organizationId),
    ]);
    const timezone = profile.timezone || organization.timezone || 'UTC';
    const seriesRange = trailingLocalDaysRange(now, timezone, query.days);
    const snapshot = await this.repository.summary(
      organizationId,
      seriesRange,
      timezone,
      now,
    );
    const keys = localDateKeys(seriesRange.start, query.days, timezone);
    const tasks = this.fillSeries(keys, snapshot.taskSeries);
    const meetings = this.fillSeries(keys, snapshot.meetingSeries);

    return {
      asOf: now.toISOString(),
      timezone,
      range: {
        start: seriesRange.start.toISOString(),
        end: seriesRange.end.toISOString(),
        days: query.days,
      },
      cards: {
        moneySaved: {
          availability: 'UNAVAILABLE',
          amount: null,
          currency: null,
          isEstimated: true,
          reason: 'TIME_SAVINGS_METHODOLOGY_NOT_CONFIGURED',
          series: [],
        },
        tasksToday: {
          availability: 'AVAILABLE',
          total: tasks.at(-1)?.value || 0,
          overdue: snapshot.overdueTasks,
          comparison: this.comparison(tasks),
          series: tasks,
        },
        hoursSaved: {
          availability: 'UNAVAILABLE',
          minutes: null,
          hours: null,
          isEstimated: true,
          reason: 'TIME_SAVINGS_METHODOLOGY_NOT_CONFIGURED',
          series: [],
        },
        meetingsScheduled: {
          availability: 'AVAILABLE',
          total: meetings.at(-1)?.value || 0,
          comparison: this.comparison(meetings),
          series: meetings,
        },
      },
    };
  }

  async workforce(
    organizationId: string,
    query: DashboardWorkforceQueryDto,
    now = new Date(),
  ) {
    const range = {
      from: new Date(now.getTime() - query.activityHours * 60 * 60_000),
      to: now,
    };
    const [catalog, activityRows] = await Promise.all([
      this.agents.list({
        page: query.page,
        limit: query.limit,
        status: AgentStatus.ACTIVE,
      }),
      this.activities.list(
        organizationId,
        range,
        Math.min(1_000, Math.max(100, query.limit * 20)),
      ),
    ]);
    const latestByAgent = new Map<string, (typeof activityRows)[number]>();
    for (const activity of activityRows) {
      if (activity.agentId && !latestByAgent.has(activity.agentId)) {
        latestByAgent.set(activity.agentId, activity);
      }
    }
    const workingCutoff = now.getTime() - 15 * 60_000;

    return {
      catalogScope: 'GLOBAL',
      availableToAllOrganizers: true,
      activityRange: {
        from: range.from.toISOString(),
        to: range.to.toISOString(),
      },
      ...catalog,
      items: catalog.items.map((agent) => {
        const record = agent as Record<string, unknown>;
        const id = String(record._id || '');
        const { _id, __v, nameKey, disabledAt, ...publicAgent } = record;
        void _id;
        void __v;
        void nameKey;
        void disabledAt;
        const activity = latestByAgent.get(id);
        const isWorking =
          activity?.status === AgentActivityStatus.STARTED &&
          new Date(activity.startedAt).getTime() >= workingCutoff;
        return {
          ...publicAgent,
          id,
          runtimeStatus: isWorking ? 'WORKING' : 'ACTIVE',
          lastActivity: activity
            ? {
                status: activity.status,
                operationType: activity.operationType,
                startedAt: activity.startedAt,
                completedAt: activity.completedAt,
              }
            : null,
        };
      }),
    };
  }

  async upcomingMeetings(
    organizationId: string,
    query: DashboardListQueryDto,
    now = new Date(),
  ) {
    const items = await this.repository.upcomingMeetings(
      organizationId,
      now,
      query.limit,
    );
    return { asOf: now.toISOString(), items };
  }

  async todayBriefing(
    organizationId: string,
    userId: string,
    role: UserRole,
    now = new Date(),
  ) {
    try {
      const briefing = await this.briefings.getLatest(
        organizationId,
        userId,
        role,
        ExecutiveBriefingType.TODAY,
        now.toISOString(),
      );
      return { availability: 'AVAILABLE', briefing };
    } catch (error) {
      if (error instanceof NotFoundException) {
        return {
          availability: 'UNAVAILABLE',
          briefing: null,
          reason: 'TODAY_BRIEFING_NOT_GENERATED',
        };
      }
      throw error;
    }
  }

  async recentVoiceNotes(organizationId: string, query: DashboardListQueryDto) {
    const page = (await this.callIntelligence.list(organizationId, {
      page: 1,
      limit: query.limit,
      kind: CallIntelligenceItemKind.CALL,
    })) as { items: RecentCallItem[]; total: number };
    const sourceIds = page.items.map((item) => item.source.id);
    const summaries = await this.repository.proposalSummaries(
      organizationId,
      sourceIds,
    );

    return {
      items: page.items.map((item) => {
        const summary = summaries.get(item.source.id);
        return {
          ...item,
          reviewStatus: this.voiceNoteStatus(item.aiStatus, summary),
          agent: summary?.agent || null,
          taskCount: summary?.taskCount || 0,
          meetingCount: summary?.meetingCount || 0,
        };
      }),
      total: page.total,
    };
  }

  async taskOverview(organizationId: string, now = new Date()) {
    const counts = await this.repository.taskOverview(organizationId, now);
    return { asOf: now.toISOString(), ...counts };
  }

  async topPriorities(
    organizationId: string,
    query: DashboardListQueryDto,
    now = new Date(),
  ) {
    const tasks = await this.repository.topPriorities(
      organizationId,
      now,
      query.limit,
    );
    return {
      asOf: now.toISOString(),
      items: tasks.map((task) => {
        const { _id, ...item } = task as Record<string, unknown> & {
          _id: unknown;
        };
        const dueDate = item.dueDate ? new Date(String(item.dueDate)) : null;
        return {
          id: String(_id),
          ...item,
          isOverdue:
            item.status !== TaskStatus.COMPLETED &&
            Boolean(dueDate && dueDate.getTime() < now.getTime()),
        };
      }),
    };
  }

  private fillSeries(
    keys: string[],
    values: Array<{ date: string; value: number }>,
  ) {
    const indexed = new Map(values.map((item) => [item.date, item.value]));
    return keys.map((date) => ({ date, value: indexed.get(date) || 0 }));
  }

  private comparison(series: Array<{ date: string; value: number }>) {
    const current = series.at(-1)?.value || 0;
    const previous = series.at(-2)?.value || 0;
    return {
      period: 'PREVIOUS_DAY',
      previousValue: previous,
      changePercent:
        previous === 0
          ? current === 0
            ? 0
            : null
          : Number((((current - previous) / previous) * 100).toFixed(2)),
    };
  }

  private voiceNoteStatus(aiStatus: unknown, proposal?: ProposalSourceSummary) {
    if (['PENDING', 'PROCESSING'].includes(String(aiStatus))) {
      return 'PROCESSING';
    }
    switch (proposal?.latestStatus) {
      case AiActionProposalStatus.REJECTED:
        return 'REJECTED';
      case AiActionProposalStatus.APPROVED:
      case AiActionProposalStatus.EXECUTED:
        return 'APPROVED';
      case AiActionProposalStatus.FAILED:
        return 'FAILED';
      case AiActionProposalStatus.ANALYZING:
      case AiActionProposalStatus.NEEDS_CLARIFICATION:
      case AiActionProposalStatus.PENDING:
      case AiActionProposalStatus.EXECUTING:
        return 'PROCESSING';
      default:
        return String(aiStatus) === 'COMPLETED' ? 'COMPLETED' : 'PROCESSING';
    }
  }
}
