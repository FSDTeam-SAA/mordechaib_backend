import {
  AiActionProposalStatus,
  AiActionType,
  AiProposalSourceType,
} from '../../database/schemas/ai-action-proposal.schema';
import { AgentType } from '../../common/enums/agent-type.enum';
import { UserRole } from '../../common/enums/user-role.enum';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { PlatformMeetingsService } from '../meeting-bots/platform-meetings.service';
import { OrganizationsService } from '../organizations/organizations.service';
import { TasksService } from '../tasks/tasks.service';
import { UsersService } from '../users/users.service';
import { AiActionsRepository } from './ai-actions.repository';
import { AiActionsService } from './ai-actions.service';
import { SourceAnalysesRepository } from '../source-analyses/source-analyses.repository';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateAiActionProposalDto } from './dto/update-ai-action-proposal.dto';

describe('AiActionsService analysis ingestion', () => {
  const organizationId = '66cc9bdfa847ea856c7b41d2';
  const salesAgentId = '66cc9bdfa847ea856c7b41a1';
  const operationsAgentId = '66cc9bdfa847ea856c7b41a2';
  const source = {
    type: AiProposalSourceType.GOOGLE_MEET,
    id: '66cc9bdfa847ea856c7b41d4',
  };
  const owner = {
    id: '66cc9bdfa847ea856c7b41f1',
    email: 'owner@example.com',
    firstName: 'Test',
    lastName: 'Owner',
    organizationId,
    role: UserRole.OWNER,
    sessionId: 'session-1',
    isPlatformAdmin: false,
  };
  const repository = {
    findByProposalIdWithHash: jest.fn(),
    findActiveAgent: jest.fn(),
    create: jest.fn(),
    findById: jest.fn(),
    list: jest.fn(),
    getActionCenter: jest.fn(),
    updatePendingPayload: jest.fn(),
  };
  const organizations = { findCurrent: jest.fn() };
  const sourceAnalyses = { upsert: jest.fn() };
  const auditLogs = { create: jest.fn() };
  const analysis = {
    sentimentAnalysis: {
      score: { positive: 60, neutral: 30, negative: 10 },
    },
    customerIntelligence: { healthScore: 82, riskLevel: 'LOW' },
    patternDetection: {
      valueProposition: 10,
      pricingObjection: 5,
      budgetApproval: 15,
      marketTrends: 20,
      followUpRequests: 70,
    },
  };
  let service: AiActionsService;

  beforeEach(() => {
    jest.resetAllMocks();
    repository.findByProposalIdWithHash.mockResolvedValue(null);
    repository.findActiveAgent.mockImplementation(async (id: string) =>
      id === salesAgentId
        ? { _id: id, name: 'Sales Agent', type: AgentType.SALES }
        : {
            _id: id,
            name: 'Operations Agent',
            type: AgentType.OPERATIONS,
          },
    );
    organizations.findCurrent.mockResolvedValue({
      _id: organizationId,
      timezone: 'UTC',
    });
    repository.create.mockImplementation(async (input) => ({
      _id: '66cc9bdfa847ea856c7b41d5',
      ...input,
    }));
    auditLogs.create.mockResolvedValue(undefined);
    service = new AiActionsService(
      repository as unknown as AiActionsRepository,
      {} as TasksService,
      {} as PlatformMeetingsService,
      {} as UsersService,
      organizations as unknown as OrganizationsService,
      auditLogs as unknown as AuditLogsService,
      sourceAnalyses as unknown as SourceAnalysesRepository,
    );
  });

  it('filters the canonical proposal list by source identity', async () => {
    repository.list.mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      limit: 20,
      pages: 1,
    });

    await service.list(organizationId, {
      page: 1,
      limit: 20,
      status: AiActionProposalStatus.NEEDS_CLARIFICATION,
      sourceId: source.id,
      sourceType: source.type,
    });

    expect(repository.list).toHaveBeenCalledWith(organizationId, 1, 20, {
      status: AiActionProposalStatus.NEEDS_CLARIFICATION,
      actionType: undefined,
      proposedByAgentId: undefined,
      sourceId: source.id,
      sourceType: source.type,
    });
  });

  it('includes clarification questions and answers in action center cards', async () => {
    repository.getActionCenter.mockResolvedValue({
      priorityTasks: [],
      meetingSchedules: [
        {
          _id: '66cc9bdfa847ea856c7b41d5',
          proposalId: 'meeting-002:project-review',
          actionType: AiActionType.SCHEDULE_MEETING,
          proposedByAgent: {
            id: operationsAgentId,
            name: 'Operations Agent',
            type: AgentType.OPERATIONS,
          },
          source,
          payload: {
            platform: 'GOOGLE_MEET',
            title: 'Project review',
            timezone: 'UTC',
          },
          confidence: 0.81,
          revision: 3,
          status: AiActionProposalStatus.NEEDS_CLARIFICATION,
          clarificationQuestions: [
            {
              id: 'meeting-time',
              field: 'startsAt',
              question: 'What time should the meeting start?',
              inputType: 'datetime',
              required: true,
            },
            {
              id: 'invitee-email',
              field: 'invitees',
              question: 'What email address should be invited?',
              inputType: 'email',
              required: true,
            },
          ],
          clarificationAnswers: {
            'meeting-time': '2026-09-17T15:00:00Z',
          },
        },
      ],
      totals: { priorityTasks: 0, meetingSchedules: 1 },
    });

    const result = await service.getActionCenter(organizationId, source.id, {
      taskLimit: 4,
      meetingLimit: 4,
      status: AiActionProposalStatus.NEEDS_CLARIFICATION,
      sourceType: AiProposalSourceType.GOOGLE_MEET,
    });

    expect(result.meetingSchedules[0]).toEqual(
      expect.objectContaining({
        revision: 3,
        clarificationQuestions: [
          expect.objectContaining({ id: 'meeting-time' }),
          expect.objectContaining({ id: 'invitee-email' }),
        ],
        clarificationAnswers: {
          'meeting-time': '2026-09-17T15:00:00Z',
        },
      }),
    );
  });

  it('returns actions across all statuses when the status filter is omitted', async () => {
    repository.getActionCenter.mockResolvedValue({
      priorityTasks: [],
      meetingSchedules: [],
      totals: { priorityTasks: 0, meetingSchedules: 0 },
    });

    const result = await service.getActionCenter(organizationId, source.id, {
      taskLimit: 4,
      meetingLimit: 4,
      sourceType: source.type,
    });

    expect(repository.getActionCenter).toHaveBeenCalledWith(
      organizationId,
      source.id,
      {
        taskLimit: 4,
        meetingLimit: 4,
        sourceType: source.type,
      },
    );
    expect(result.status).toBe('ALL');
  });

  it('validates and atomically updates a pending proposal payload', async () => {
    repository.findById.mockResolvedValue({
      _id: '66cc9bdfa847ea856c7b41d5',
      organizationId,
      actionType: AiActionType.SCHEDULE_MEETING,
      status: AiActionProposalStatus.PENDING,
      revision: 3,
      payload: {
        platform: 'GOOGLE_MEET',
        title: 'Project review',
        startsAt: '2026-10-05T09:00:00.000Z',
        durationMinutes: 30,
        timezone: 'Asia/Dhaka',
        invitees: ['old@example.com'],
      },
    });
    repository.updatePendingPayload.mockResolvedValue({
      _id: '66cc9bdfa847ea856c7b41d5',
      organizationId,
      actionType: AiActionType.SCHEDULE_MEETING,
      status: AiActionProposalStatus.PENDING,
      revision: 4,
      payload: {
        platform: 'GOOGLE_MEET',
        title: 'Updated project review',
        startsAt: '2026-10-05T09:00:00.000Z',
        durationMinutes: 45,
        timezone: 'Asia/Dhaka',
        invitees: ['client@example.com'],
      },
    });

    const result = await service.updatePending(
      organizationId,
      owner,
      '66cc9bdfa847ea856c7b41d5',
      {
        expectedRevision: 3,
        payload: {
          title: 'Updated project review',
          durationMinutes: 45,
          invitees: ['CLIENT@example.com'],
        },
      },
    );

    expect(repository.updatePendingPayload).toHaveBeenCalledWith(
      organizationId,
      '66cc9bdfa847ea856c7b41d5',
      3,
      expect.objectContaining({
        title: 'Updated project review',
        durationMinutes: 45,
        invitees: ['client@example.com'],
      }),
      { id: owner.id, name: 'Test Owner' },
    );
    expect(auditLogs.create).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'AI_ACTION_PROPOSAL_EDITED',
        metadata: expect.objectContaining({
          previousRevision: 3,
          revision: 4,
          changedFields: ['durationMinutes', 'invitees', 'title'],
        }),
      }),
    );
    expect(result).toEqual(expect.objectContaining({ revision: 4 }));
  });

  it('uses the stored revision when an older client omits expectedRevision', async () => {
    repository.findById.mockResolvedValue({
      _id: '66cc9bdfa847ea856c7b41d5',
      organizationId,
      actionType: AiActionType.CREATE_TASK,
      status: AiActionProposalStatus.PENDING,
      revision: 3,
      payload: { title: 'Review notes', priority: 'MEDIUM' },
    });
    repository.updatePendingPayload.mockResolvedValue({
      _id: '66cc9bdfa847ea856c7b41d5',
      organizationId,
      actionType: AiActionType.CREATE_TASK,
      status: AiActionProposalStatus.PENDING,
      revision: 4,
      payload: { title: 'Updated notes', priority: 'MEDIUM' },
    });

    await service.updatePending(
      organizationId,
      owner,
      '66cc9bdfa847ea856c7b41d5',
      { payload: { title: 'Updated notes' } },
    );

    expect(repository.updatePendingPayload).toHaveBeenCalledWith(
      organizationId,
      '66cc9bdfa847ea856c7b41d5',
      3,
      expect.objectContaining({ title: 'Updated notes' }),
      { id: owner.id, name: 'Test Owner' },
    );
  });

  it('accepts an edit DTO without expectedRevision for older clients', async () => {
    const input = plainToInstance(UpdateAiActionProposalDto, {
      payload: { title: 'Updated notes' },
    });

    await expect(validate(input)).resolves.toHaveLength(0);
  });

  it('rejects a stale proposal edit without writing', async () => {
    repository.findById.mockResolvedValue({
      _id: '66cc9bdfa847ea856c7b41d5',
      organizationId,
      actionType: AiActionType.CREATE_TASK,
      status: AiActionProposalStatus.PENDING,
      revision: 2,
      payload: { title: 'Review notes' },
    });

    await expect(
      service.updatePending(organizationId, owner, '66cc9bdfa847ea856c7b41d5', {
        expectedRevision: 1,
        payload: { title: 'Updated notes' },
      }),
    ).rejects.toThrow('Proposal revision conflict; current revision is 2');
    expect(repository.updatePendingPayload).not.toHaveBeenCalled();
  });

  it('does not allow a proposal to be edited after approval', async () => {
    repository.findById.mockResolvedValue({
      _id: '66cc9bdfa847ea856c7b41d5',
      organizationId,
      actionType: AiActionType.CREATE_TASK,
      status: AiActionProposalStatus.APPROVED,
      revision: 1,
      payload: { title: 'Review notes' },
    });

    await expect(
      service.updatePending(organizationId, owner, '66cc9bdfa847ea856c7b41d5', {
        expectedRevision: 1,
        payload: { title: 'Updated notes' },
      }),
    ).rejects.toThrow(
      'Only a PENDING proposal can be edited; current status is APPROVED',
    );
    expect(repository.updatePendingPayload).not.toHaveBeenCalled();
  });

  it('stores a complete task as a pending CEO approval', async () => {
    const [proposal] = await service.ingestAnalysis(organizationId, source, {
      requestId: 'meeting-001',
      source,
      actions: [
        {
          actionId: 'send-quotation',
          actionType: AiActionType.CREATE_TASK,
          proposedByAgent: {
            id: salesAgentId,
            name: 'Sales Agent',
            type: AgentType.SALES,
          },
          payload: { title: 'Send quotation', priority: 'HIGH' },
          confidence: 0.92,
        },
      ],
      analysis,
    });

    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        proposalId: 'meeting-001:send-quotation',
        status: AiActionProposalStatus.PENDING,
        source,
        analysis,
      }),
    );
    expect(proposal).toEqual(
      expect.objectContaining({ status: AiActionProposalStatus.PENDING }),
    );
  });

  it('rejects a new proposal from an unregistered or disabled agent', async () => {
    repository.findActiveAgent.mockResolvedValue(null);

    await expect(
      service.ingestAnalysis(organizationId, source, {
        requestId: 'meeting-disabled-agent',
        source,
        actions: [
          {
            actionId: 'send-quotation',
            actionType: AiActionType.CREATE_TASK,
            proposedByAgent: {
              id: salesAgentId,
              name: 'Sales Agent',
              type: AgentType.SALES,
            },
            payload: { title: 'Send quotation' },
            confidence: 0.9,
          },
        ],
        analysis,
      }),
    ).rejects.toThrow('AI proposedByAgent is not an active platform agent');
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('persists canonical agent profile metadata from Main Backend', async () => {
    repository.findActiveAgent.mockResolvedValue({
      _id: operationsAgentId,
      name: 'Layla',
      type: AgentType.OPERATIONS,
    });

    await service.ingestAnalysis(organizationId, source, {
      requestId: 'meeting-stale-agent-profile',
      source,
      actions: [
        {
          actionId: 'review-notes',
          actionType: AiActionType.CREATE_TASK,
          proposedByAgent: {
            id: operationsAgentId,
            name: 'Old display name',
            type: AgentType.CUSTOM,
          },
          payload: { title: 'Review notes' },
          confidence: 0.9,
        },
      ],
      analysis,
    });

    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        proposedByAgent: {
          id: operationsAgentId,
          name: 'Layla',
          type: AgentType.OPERATIONS,
        },
      }),
    );
  });

  it('stores an incomplete meeting as a clarification draft', async () => {
    await service.ingestAnalysis(organizationId, source, {
      requestId: 'meeting-002',
      source,
      actions: [
        {
          actionId: 'project-review',
          actionType: AiActionType.SCHEDULE_MEETING,
          proposedByAgent: {
            id: operationsAgentId,
            name: 'Operations Agent',
            type: AgentType.OPERATIONS,
          },
          payload: { title: 'Project review', platform: 'GOOGLE_MEET' },
          confidence: 0.81,
          clarificationQuestions: [
            {
              id: 'meeting-time',
              field: 'startsAt',
              question: 'What time should the meeting start?',
              inputType: 'TIME',
            },
          ],
        },
      ],
      analysis,
    });

    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        status: AiActionProposalStatus.NEEDS_CLARIFICATION,
        payload: expect.objectContaining({ timezone: 'UTC' }),
        clarificationQuestions: [
          expect.objectContaining({ id: 'meeting-time', required: true }),
        ],
      }),
    );
  });

  it('turns an AI-assumed meeting time into a clarification', async () => {
    await service.ingestAnalysis(organizationId, source, {
      requestId: 'meeting-assumed-time',
      source,
      actions: [
        {
          actionId: 'project-review',
          actionType: AiActionType.SCHEDULE_MEETING,
          proposedByAgent: {
            id: operationsAgentId,
            name: 'Operations Agent',
            type: AgentType.OPERATIONS,
          },
          payload: {
            platform: 'GOOGLE_MEET',
            title: 'Project review',
            startsAt: '2026-09-16T00:00:00Z',
          },
          confidence: 0.81,
        },
      ],
      analysis: {
        ...analysis,
        summary:
          'A follow-up meeting was requested, but no exact meeting time was provided.',
      },
    });

    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        status: AiActionProposalStatus.NEEDS_CLARIFICATION,
        payload: expect.not.objectContaining({ startsAt: expect.anything() }),
        clarificationQuestions: [
          expect.objectContaining({
            field: 'startsAt',
            id: 'meeting-start-time',
          }),
        ],
      }),
    );
  });

  it('rejects an AI result without the required analysis summary', async () => {
    await expect(
      service.ingestAnalysis(organizationId, source, {
        requestId: 'meeting-004',
        source,
        actions: [],
        analysis: undefined as never,
      }),
    ).rejects.toThrow('AI returned an invalid analysis summary');
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('stores only the pattern signals the AI could evaluate', async () => {
    await service.ingestAnalysis(organizationId, source, {
      requestId: 'meeting-sparse-patterns',
      source,
      actions: [
        {
          actionId: 'follow-up-task',
          actionType: AiActionType.CREATE_TASK,
          proposedByAgent: {
            id: salesAgentId,
            name: 'Sales Agent',
            type: AgentType.SALES,
          },
          payload: { title: 'Follow up with the customer' },
          confidence: 0.8,
        },
      ],
      analysis: {
        sentimentAnalysis: {
          score: { positive: 50, neutral: 50, negative: 0 },
        },
        customerIntelligence: { healthScore: 70, riskLevel: 'low' },
        patternDetection: { followUpRequests: 80 },
      },
    });

    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        analysis: {
          sentimentAnalysis: {
            score: { positive: 50, neutral: 50, negative: 0 },
          },
          customerIntelligence: { healthScore: 70, riskLevel: 'LOW' },
          patternDetection: { followUpRequests: 80 },
        },
      }),
    );
  });

  it('accepts an empty pattern detection object when no signal was evaluated', async () => {
    await service.ingestAnalysis(organizationId, source, {
      requestId: 'meeting-no-patterns',
      source,
      actions: [
        {
          actionId: 'general-task',
          actionType: AiActionType.CREATE_TASK,
          proposedByAgent: {
            id: operationsAgentId,
            name: 'Operations Agent',
            type: AgentType.OPERATIONS,
          },
          payload: { title: 'Review meeting notes' },
          confidence: 0.7,
        },
      ],
      analysis: {
        sentimentAnalysis: {
          score: { positive: 0, neutral: 100, negative: 0 },
        },
        customerIntelligence: { healthScore: 50, riskLevel: 'UNKNOWN' },
        patternDetection: {},
      },
    });

    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        analysis: expect.objectContaining({ patternDetection: {} }),
      }),
    );
  });

  it('rejects an invalid provided pattern signal', async () => {
    await expect(
      service.ingestAnalysis(organizationId, source, {
        requestId: 'meeting-invalid-pattern',
        source,
        actions: [],
        analysis: {
          sentimentAnalysis: {
            score: { positive: 50, neutral: 50, negative: 0 },
          },
          customerIntelligence: { healthScore: 70, riskLevel: 'LOW' },
          patternDetection: { followUpRequests: 101 },
        },
      }),
    ).rejects.toThrow('AI returned an invalid analysis summary');
  });

  it('persists source analysis even when AI returns no actions', async () => {
    await service.ingestAnalysis(organizationId, source, {
      requestId: 'meeting-analysis-only',
      source,
      actions: [],
      analysis: {
        ...analysis,
        summary: 'The customer requested a commercial follow-up.',
        overallConfidence: 0.91,
        classifiedSegments: [
          {
            id: 'segment-1',
            category: 'COMMITMENT' as never,
            text: 'We will send the quotation tomorrow.',
            speaker: 'Account Executive',
            startTimeSeconds: 20,
            endTimeSeconds: 24,
            confidence: 0.93,
          },
        ],
      },
    });

    expect(repository.create).not.toHaveBeenCalled();
    expect(sourceAnalyses.upsert).toHaveBeenCalledWith(
      organizationId,
      'meeting-analysis-only',
      source,
      expect.objectContaining({
        summary: 'The customer requested a commercial follow-up.',
        overallConfidence: 0.91,
        classifiedSegments: [
          expect.objectContaining({ id: 'segment-1', category: 'COMMITMENT' }),
        ],
      }),
    );
  });

  it('rejects a response whose requestId does not match the submitted jobId', async () => {
    await expect(
      service.ingestAnalysis(
        organizationId,
        source,
        {
          requestId: 'wrong-job-id',
          source,
          actions: [],
          analysis,
        },
        { expectedRequestId: 'expected-job-id' },
      ),
    ).rejects.toThrow(
      'AI response requestId does not match the submitted jobId',
    );
  });

  it('rejects a response whose source does not match the queued source', async () => {
    await expect(
      service.ingestAnalysis(organizationId, source, {
        requestId: 'meeting-source-mismatch',
        source: {
          type: AiProposalSourceType.ZOOM_MEETING,
          id: source.id,
        },
        actions: [],
        analysis,
      }),
    ).rejects.toThrow('AI response source does not match the submitted source');
  });

  it('rejects duplicate action identifiers within one AI response', async () => {
    const action = {
      actionId: 'duplicate-action',
      actionType: AiActionType.CREATE_TASK,
      proposedByAgent: {
        id: operationsAgentId,
        name: 'Operations Agent',
        type: AgentType.OPERATIONS,
      },
      payload: { title: 'Review notes' },
      confidence: 0.8,
    };

    await expect(
      service.ingestAnalysis(organizationId, source, {
        requestId: 'meeting-duplicate-actions',
        source,
        actions: [action, { ...action }],
        analysis,
      }),
    ).rejects.toThrow('AI returned duplicate actionId values in one response');
  });

  it('resolves the effective IANA timezone and stores startsAt in UTC', async () => {
    await service.ingestAnalysis(
      organizationId,
      source,
      {
        requestId: 'meeting-timezone',
        source,
        actions: [
          {
            actionId: 'schedule-review',
            actionType: AiActionType.SCHEDULE_MEETING,
            proposedByAgent: {
              id: operationsAgentId,
              name: 'Operations Agent',
              type: AgentType.OPERATIONS,
            },
            payload: {
              platform: 'GOOGLE_MEET',
              title: 'Project review',
              startsAt: '2026-09-15T15:00:00+06:00',
            },
            confidence: 0.9,
          },
        ],
        analysis,
      },
      { effectiveTimezone: 'Asia/Dhaka' },
    );

    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({
          timezone: 'Asia/Dhaka',
          startsAt: '2026-09-15T09:00:00.000Z',
        }),
      }),
    );
  });

  it('rejects a meeting datetime without Z or an explicit UTC offset', async () => {
    await expect(
      service.ingestAnalysis(
        organizationId,
        source,
        {
          requestId: 'meeting-local-datetime',
          source,
          actions: [
            {
              actionId: 'schedule-review',
              actionType: AiActionType.SCHEDULE_MEETING,
              proposedByAgent: {
                id: operationsAgentId,
                name: 'Operations Agent',
                type: AgentType.OPERATIONS,
              },
              payload: {
                platform: 'GOOGLE_MEET',
                title: 'Project review',
                startsAt: '2026-09-15T15:00:00',
              },
              confidence: 0.9,
            },
          ],
          analysis,
        },
        { effectiveTimezone: 'Asia/Dhaka' },
      ),
    ).rejects.toThrow(
      'SCHEDULE_MEETING startsAt must include Z or an explicit UTC offset',
    );
  });

  it('rejects a refinement that attempts to replace the original action id', async () => {
    repository.findById.mockResolvedValue({
      _id: '66cc9bdfa847ea856c7b41d5',
      organizationId,
      requestId: 'meeting-003',
      proposalId: 'meeting-003:project-review',
      actionType: AiActionType.SCHEDULE_MEETING,
      status: AiActionProposalStatus.ANALYZING,
    });

    await expect(
      service.applyClarificationResult(
        organizationId,
        '66cc9bdfa847ea856c7b41d5',
        {
          actionId: 'different-meeting',
          actionType: AiActionType.SCHEDULE_MEETING,
          proposedByAgent: {
            id: operationsAgentId,
            name: 'Operations Agent',
            type: AgentType.OPERATIONS,
          },
          payload: {},
          confidence: 0.9,
        },
      ),
    ).rejects.toThrow(
      'AI cannot change a proposal action identifier during refinement',
    );
  });
});
