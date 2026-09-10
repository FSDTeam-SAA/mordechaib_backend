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
    organizations.findCurrent.mockResolvedValue({ _id: organizationId });
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
    );
  });

  it('stores a complete task as a pending CEO approval', async () => {
    const [proposal] = await service.ingestAnalysis(organizationId, source, {
      requestId: 'meeting-001',
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
        actions: [],
        analysis: undefined as never,
      }),
    ).rejects.toThrow('AI returned an invalid analysis summary');
    expect(repository.create).not.toHaveBeenCalled();
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
