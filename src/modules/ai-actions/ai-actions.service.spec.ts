import {
  AiActionProposalStatus,
  AiActionType,
  AiProposalSourceType,
} from '../../database/schemas/ai-action-proposal.schema';
import { AgentType } from '../../common/enums/agent-type.enum';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { PlatformMeetingsService } from '../meeting-bots/platform-meetings.service';
import { OrganizationsService } from '../organizations/organizations.service';
import { TasksService } from '../tasks/tasks.service';
import { UsersService } from '../users/users.service';
import { AiActionsRepository } from './ai-actions.repository';
import { AiActionsService } from './ai-actions.service';
import { SourceAnalysesRepository } from '../source-analyses/source-analyses.repository';

describe('AiActionsService analysis ingestion', () => {
  const organizationId = '66cc9bdfa847ea856c7b41d2';
  const source = {
    type: AiProposalSourceType.GOOGLE_MEET,
    id: '66cc9bdfa847ea856c7b41d4',
  };
  const repository = {
    findByProposalIdWithHash: jest.fn(),
    create: jest.fn(),
    findById: jest.fn(),
  };
  const organizations = { findCurrent: jest.fn() };
  const sourceAnalyses = { upsert: jest.fn() };
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
    organizations.findCurrent.mockResolvedValue({
      _id: organizationId,
      timezone: 'UTC',
    });
    repository.create.mockImplementation(async (input) => ({
      _id: '66cc9bdfa847ea856c7b41d5',
      ...input,
    }));
    service = new AiActionsService(
      repository as unknown as AiActionsRepository,
      {} as TasksService,
      {} as PlatformMeetingsService,
      {} as UsersService,
      organizations as unknown as OrganizationsService,
      {} as AuditLogsService,
      sourceAnalyses as unknown as SourceAnalysesRepository,
    );
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
            id: 'sales-agent',
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

  it('stores an incomplete meeting as a clarification draft', async () => {
    await service.ingestAnalysis(organizationId, source, {
      requestId: 'meeting-002',
      source,
      actions: [
        {
          actionId: 'project-review',
          actionType: AiActionType.SCHEDULE_MEETING,
          proposedByAgent: {
            id: 'operations-agent',
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
            id: 'sales-agent',
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
            id: 'operations-agent',
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
    ).rejects.toThrow(
      'AI response source does not match the submitted source',
    );
  });

  it('rejects duplicate action identifiers within one AI response', async () => {
    const action = {
      actionId: 'duplicate-action',
      actionType: AiActionType.CREATE_TASK,
      proposedByAgent: {
        id: 'operations-agent',
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
    ).rejects.toThrow(
      'AI returned duplicate actionId values in one response',
    );
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
              id: 'operations-agent',
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
                id: 'operations-agent',
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
      service.applyClarificationResult(organizationId, '66cc9bdfa847ea856c7b41d5', {
        actionId: 'different-meeting',
        actionType: AiActionType.SCHEDULE_MEETING,
        proposedByAgent: {
          id: 'operations-agent',
          name: 'Operations Agent',
          type: AgentType.OPERATIONS,
        },
        payload: {},
        confidence: 0.9,
      }),
    ).rejects.toThrow(
      'AI cannot change a proposal action identifier during refinement',
    );
  });
});
