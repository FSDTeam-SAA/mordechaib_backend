import { NotFoundException } from '@nestjs/common';
import { AgentActivityStatus } from '../../common/enums/agent-activity.enum';
import { AgentType } from '../../common/enums/agent-type.enum';
import { TaskStatus } from '../../common/enums/task-status.enum';
import { TaskDepartment } from '../../common/enums/task-department.enum';
import { UserRole } from '../../common/enums/user-role.enum';
import { AiActionProposalStatus } from '../../database/schemas/ai-action-proposal.schema';
import { AgentsService } from '../agents/agents.service';
import { AgentActivityService } from '../ai-telemetry/agent-activity.service';
import { AuthService } from '../auth/auth.service';
import { CallIntelligenceService } from '../call-intelligence/call-intelligence.service';
import { ExecutiveBriefingsService } from '../chief-of-staff/executive-briefings.service';
import { OrganizationsService } from '../organizations/organizations.service';
import { OrganizerDashboardRepository } from './organizer-dashboard.repository';
import { OrganizerDashboardService } from './organizer-dashboard.service';

describe('OrganizerDashboardService', () => {
  let repository: Record<string, jest.Mock>;
  let agents: Record<string, jest.Mock>;
  let activities: Record<string, jest.Mock>;
  let auth: Record<string, jest.Mock>;
  let organizations: Record<string, jest.Mock>;
  let calls: Record<string, jest.Mock>;
  let briefings: Record<string, jest.Mock>;
  let service: OrganizerDashboardService;

  beforeEach(() => {
    repository = {
      summary: jest.fn(),
      upcomingMeetings: jest.fn(),
      taskOverview: jest.fn(),
      topPriorities: jest.fn(),
      proposalSummaries: jest.fn(),
    };
    agents = { list: jest.fn() };
    activities = { list: jest.fn() };
    auth = { getMe: jest.fn() };
    organizations = { findCurrent: jest.fn() };
    calls = { list: jest.fn() };
    briefings = { getLatest: jest.fn() };
    service = new OrganizerDashboardService(
      repository as unknown as OrganizerDashboardRepository,
      agents as unknown as AgentsService,
      activities as unknown as AgentActivityService,
      auth as unknown as AuthService,
      organizations as unknown as OrganizationsService,
      calls as unknown as CallIntelligenceService,
      briefings as unknown as ExecutiveBriefingsService,
    );
  });

  it('returns measured task and meeting cards without inventing savings', async () => {
    auth.getMe.mockResolvedValue({ timezone: 'Asia/Dhaka' });
    organizations.findCurrent.mockResolvedValue({ timezone: 'UTC' });
    repository.summary.mockResolvedValue({
      taskSeries: [
        { date: '2026-09-21', value: 2 },
        { date: '2026-09-22', value: 3 },
      ],
      overdueTasks: 4,
      meetingSeries: [{ date: '2026-09-22', value: 1 }],
    });

    const result = await service.summary(
      'org-1',
      'user-1',
      { days: 7 },
      new Date('2026-09-22T06:00:00.000Z'),
    );

    expect(result.timezone).toBe('Asia/Dhaka');
    expect(result.cards.tasksToday).toMatchObject({
      availability: 'AVAILABLE',
      total: 3,
      overdue: 4,
    });
    expect(result.cards.meetingsScheduled.total).toBe(1);
    expect(result.cards.moneySaved).toMatchObject({
      availability: 'UNAVAILABLE',
      amount: null,
    });
    expect(result.cards.hoursSaved).toMatchObject({
      availability: 'UNAVAILABLE',
      hours: null,
    });
  });

  it('returns the same global catalog with organization-scoped activity', async () => {
    agents.list.mockResolvedValue({
      items: [
        {
          _id: 'agent-1',
          nameKey: 'steve',
          name: 'Steve',
          type: AgentType.SALES,
          status: 'ACTIVE',
        },
      ],
      total: 1,
      page: 1,
      limit: 20,
      pages: 1,
    });
    activities.list.mockResolvedValue([
      {
        agentId: 'agent-1',
        status: AgentActivityStatus.STARTED,
        operationType: 'SOURCE_ANALYSIS',
        startedAt: new Date('2026-09-22T05:55:00.000Z'),
      },
    ]);

    const result = await service.workforce(
      'org-1',
      { page: 1, limit: 20, activityHours: 24 },
      new Date('2026-09-22T06:00:00.000Z'),
    );

    expect(agents.list).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'ACTIVE' }),
    );
    expect(activities.list).toHaveBeenCalledWith(
      'org-1',
      expect.any(Object),
      expect.any(Number),
    );
    expect(result).toMatchObject({
      catalogScope: 'GLOBAL',
      availableToAllOrganizers: true,
      items: [
        {
          id: 'agent-1',
          name: 'Steve',
          runtimeStatus: 'WORKING',
        },
      ],
    });
    expect(result.items[0]).not.toHaveProperty('_id');
    expect(result.items[0]).not.toHaveProperty('nameKey');
  });

  it('returns an unavailable widget when today briefing was not generated', async () => {
    briefings.getLatest.mockRejectedValue(
      new NotFoundException('Executive briefing not found'),
    );

    await expect(
      service.todayBriefing(
        'org-1',
        'user-1',
        UserRole.OWNER,
        new Date('2026-09-22T06:00:00.000Z'),
      ),
    ).resolves.toEqual({
      availability: 'UNAVAILABLE',
      briefing: null,
      reason: 'TODAY_BRIEFING_NOT_GENERATED',
    });
  });

  it('enriches recent voice notes with batched proposal summaries', async () => {
    calls.list.mockResolvedValue({
      items: [
        {
          source: { id: 'source-1', type: 'CALL_TRANSCRIPT' },
          title: 'Customer call',
          aiStatus: 'COMPLETED',
          detailsPath: '/details/source-1',
        },
      ],
      total: 1,
    });
    repository.proposalSummaries.mockResolvedValue(
      new Map([
        [
          'source-1',
          {
            sourceId: 'source-1',
            taskCount: 3,
            meetingCount: 1,
            statuses: [AiActionProposalStatus.EXECUTED],
            latestStatus: AiActionProposalStatus.EXECUTED,
            agent: { id: 'agent-1', name: 'Steve', type: AgentType.SALES },
          },
        ],
      ]),
    );

    const result = await service.recentVoiceNotes('org-1', { limit: 4 });

    expect(repository.proposalSummaries).toHaveBeenCalledWith('org-1', [
      'source-1',
    ]);
    expect(result.items[0]).toMatchObject({
      reviewStatus: 'APPROVED',
      taskCount: 3,
      meetingCount: 1,
      agent: { name: 'Steve' },
    });
  });

  it('marks overdue top priorities without changing task status', async () => {
    repository.topPriorities.mockResolvedValue([
      {
        _id: 'task-1',
        title: 'Follow up',
        status: TaskStatus.TODO,
        dueDate: new Date('2026-09-21T06:00:00.000Z'),
      },
    ]);

    const result = await service.topPriorities(
      'org-1',
      { limit: 4 },
      new Date('2026-09-22T06:00:00.000Z'),
    );

    expect(result.items[0]).toMatchObject({
      id: 'task-1',
      status: TaskStatus.TODO,
      isOverdue: true,
    });
  });

  it('returns grounded weekly task dashboard analytics', async () => {
    auth.getMe.mockResolvedValue({ timezone: 'Asia/Dhaka' });
    organizations.findCurrent.mockResolvedValue({ timezone: 'UTC' });
    repository.taskOverview.mockResolvedValue({
      snapshot: {
        total: 11,
        completed: 2,
        inProgress: 3,
        pending: 5,
        overdue: 1,
      },
      current: {
        total: 10,
        completed: 2,
        inProgress: 3,
        pending: 4,
        overdue: 1,
      },
      previous: {
        total: 8,
        completed: 1,
        inProgress: 2,
        pending: 4,
        overdue: 1,
      },
      series: [
        {
          date: '2026-09-23',
          total: 3,
          completed: 1,
          inProgress: 1,
          pending: 1,
          overdue: 0,
        },
      ],
      departments: [
        { department: TaskDepartment.SALES, count: 4 },
        { department: TaskDepartment.MARKETING, count: 2 },
      ],
    });

    const result = await service.taskOverview(
      'org-1',
      'user-1',
      new Date('2026-09-23T06:00:00.000Z'),
    );

    expect(repository.taskOverview).toHaveBeenCalledWith(
      'org-1',
      new Date('2026-09-23T06:00:00.000Z'),
      {
        start: new Date('2026-09-20T18:00:00.000Z'),
        end: new Date('2026-09-27T18:00:00.000Z'),
        timezone: 'Asia/Dhaka',
      },
      {
        start: new Date('2026-09-13T18:00:00.000Z'),
        end: new Date('2026-09-20T18:00:00.000Z'),
        timezone: 'Asia/Dhaka',
      },
      'Asia/Dhaka',
    );
    expect(result).toMatchObject({
      timezone: 'Asia/Dhaka',
      total: 11,
      period: {
        type: 'THIS_WEEK',
        counts: { total: 10 },
        comparison: {
          total: { current: 10, previous: 8, changePercent: 25 },
        },
      },
      productivity: {
        completionRate: 20,
        overallScore: { availability: 'UNAVAILABLE', value: null },
      },
    });
    expect(result.period.series).toHaveLength(7);
    expect(result.taskBreakdown.items).toEqual(
      expect.arrayContaining([
        {
          department: TaskDepartment.SALES,
          count: 4,
          percentage: 40,
        },
        {
          department: TaskDepartment.STRATEGY,
          count: 0,
          percentage: 0,
        },
      ]),
    );
  });
});
