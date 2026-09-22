import { Model } from 'mongoose';
import { AgentStatus } from '../../common/enums/agent-status.enum';
import { AgentType } from '../../common/enums/agent-type.enum';
import {
  BriefingFactAvailability,
  ExecutiveBriefingType,
} from '../../common/enums/executive-briefing.enum';
import { TaskDepartment } from '../../common/enums/task-department.enum';
import { TaskPriority } from '../../common/enums/task-priority.enum';
import { TaskStatus } from '../../common/enums/task-status.enum';
import { UserRole } from '../../common/enums/user-role.enum';
import { Agent } from '../../database/schemas/agent.schema';
import { AiActionProposal } from '../../database/schemas/ai-action-proposal.schema';
import { AiSourceAnalysis } from '../../database/schemas/ai-source-analysis.schema';
import { ManagedCalendarEvent } from '../../database/schemas/managed-calendar-event.schema';
import { Organization } from '../../database/schemas/organization.schema';
import { PlatformMeeting } from '../../database/schemas/platform-meeting.schema';
import { TaskItem } from '../../database/schemas/task-item.schema';
import { User } from '../../database/schemas/user.schema';
import { StrategicNote } from '../../database/schemas/strategic-note.schema';
import { AgentActivityService } from '../ai-telemetry/agent-activity.service';
import { ExecutiveBriefingFactsService } from './executive-briefing-facts.service';

describe('ExecutiveBriefingFactsService', () => {
  const organizationId = '507f1f77bcf86cd799439011';
  const requesterUserId = '507f1f77bcf86cd799439012';
  const capturedAt = new Date('2026-09-18T05:30:00.000Z');

  it('builds a stable, bounded snapshot and preserves unavailable domains', async () => {
    const service = new ExecutiveBriefingFactsService(
      modelWithFindOne({
        _id: organizationId,
        name: 'Example Ltd.',
        timezone: 'Asia/Dhaka',
        language: 'en',
        status: 'ACTIVE',
      }) as unknown as Model<Organization>,
      modelWithFindOne({
        _id: requesterUserId,
        firstName: 'Rifat',
        lastName: 'Hossain',
        language: 'en',
        role: UserRole.OWNER,
      }) as unknown as Model<User>,
      modelWithFind([
        {
          _id: '507f1f77bcf86cd799439013',
          name: 'Laura',
          type: AgentType.CHIEF_OF_STAFF,
          status: AgentStatus.ACTIVE,
        },
      ]) as unknown as Model<Agent>,
      modelWithFind([
        {
          _id: '507f1f77bcf86cd799439014',
          title: 'Launch campaign',
          department: TaskDepartment.MARKETING,
          priority: TaskPriority.HIGH,
          status: TaskStatus.IN_PROGRESS,
          dueDate: new Date('2026-09-18T10:00:00.000Z'),
          createdAt: capturedAt,
          updatedAt: capturedAt,
          tags: ['launch'],
        },
      ]) as unknown as Model<TaskItem>,
      modelWithFind([]) as unknown as Model<PlatformMeeting>,
      modelWithFind([]) as unknown as Model<ManagedCalendarEvent>,
      modelWithFind([
        {
          _id: '507f1f77bcf86cd799439015',
          proposalId: 'proposal-1',
          actionType: 'CREATE_TASK',
          status: 'PENDING',
          payload: { title: 'Review launch' },
          createdAt: capturedAt,
          updatedAt: capturedAt,
        },
      ]) as unknown as Model<AiActionProposal>,
      modelWithFind([]) as unknown as Model<AiSourceAnalysis>,
      modelWithFind([
        {
          _id: '507f1f77bcf86cd799439016',
          createdByUserId: requesterUserId,
          content: 'Prioritize the enterprise pipeline.',
          appliesTo: [ExecutiveBriefingType.TODAY],
          validFrom: capturedAt,
          createdAt: capturedAt,
          updatedAt: capturedAt,
        },
      ]) as unknown as Model<StrategicNote>,
      {
        list: jest.fn().mockResolvedValue([
          {
            _id: '507f1f77bcf86cd799439017',
            operationType: 'SOURCE_ANALYSIS',
            jobId: 'job-1',
            status: 'SUCCEEDED',
            startedAt: capturedAt,
            completedAt: capturedAt,
            latencyMs: 125,
            attempt: 1,
            updatedAt: capturedAt,
          },
        ]),
        healthSnapshot: jest.fn().mockResolvedValue({
          from: '2026-09-17T18:00:00.000Z',
          to: '2026-09-18T18:00:00.000Z',
          totalRuns: 1,
          completedRuns: 1,
          succeeded: 1,
          failed: 0,
          running: 0,
          skipped: 0,
          successRatePercent: 100,
          averageLatencyMs: 125,
          p95LatencyMs: 125,
          operationCounts: { SOURCE_ANALYSIS: 1 },
        }),
      } as unknown as AgentActivityService,
    );
    const asOf = new Date('2026-09-18T06:00:00.000Z');

    const first = await service.prepare(
      organizationId,
      requesterUserId,
      ExecutiveBriefingType.TODAY,
      asOf,
    );
    const second = await service.prepare(
      organizationId,
      requesterUserId,
      ExecutiveBriefingType.TODAY,
      asOf,
    );

    expect(first.input.period).toEqual({
      start: '2026-09-17T18:00:00.000Z',
      end: '2026-09-18T18:00:00.000Z',
      timezone: 'Asia/Dhaka',
    });
    expect(first.input.facts.tasks.items).toHaveLength(1);
    expect(first.input.facts.actionProposals.items[0]).toEqual(
      expect.objectContaining({
        sourceType: 'AI_ACTION_PROPOSAL',
        sourceId: '507f1f77bcf86cd799439015',
      }),
    );
    expect(first.input.facts.marketing).toEqual(
      expect.objectContaining({
        availability: BriefingFactAvailability.PARTIAL,
        items: [expect.objectContaining({ sourceType: 'TASK' })],
      }),
    );
    expect(first.input.facts.finance).toEqual({
      availability: BriefingFactAvailability.UNAVAILABLE,
      items: [],
    });
    expect(first.input.facts.agentActivity.items).toHaveLength(1);
    expect(first.input.facts.aiQuality.availability).toBe(
      BriefingFactAvailability.AVAILABLE,
    );
    expect(first.input.facts.strategicNotes.items[0]).toEqual(
      expect.objectContaining({ sourceType: 'STRATEGIC_NOTE' }),
    );
    expect(first.inputHash).toBe(second.inputHash);
    expect(first.input.idempotencyKey).toBe(second.input.idempotencyKey);
  });

  function modelWithFindOne(value: unknown) {
    return { findOne: jest.fn(() => query(value)) };
  }

  function modelWithFind(value: unknown[]) {
    return { find: jest.fn(() => query(value)) };
  }

  function query(value: unknown) {
    const chain = {
      select: jest.fn(),
      sort: jest.fn(),
      limit: jest.fn(),
      lean: jest.fn(),
      exec: jest.fn(() => Promise.resolve(value)),
    };
    chain.select.mockReturnValue(chain);
    chain.sort.mockReturnValue(chain);
    chain.limit.mockReturnValue(chain);
    chain.lean.mockReturnValue(chain);
    return chain;
  }
});
