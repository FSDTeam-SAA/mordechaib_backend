import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import crypto from 'crypto';
import { Model } from 'mongoose';
import { AgentStatus } from '../../common/enums/agent-status.enum';
import {
  BriefingFactAvailability,
  ExecutiveBriefingType,
} from '../../common/enums/executive-briefing.enum';
import { TaskDepartment } from '../../common/enums/task-department.enum';
import { TaskStatus } from '../../common/enums/task-status.enum';
import { UserRole } from '../../common/enums/user-role.enum';
import { Agent } from '../../database/schemas/agent.schema';
import {
  AiActionProposal,
  AiActionProposalStatus,
} from '../../database/schemas/ai-action-proposal.schema';
import { AiSourceAnalysis } from '../../database/schemas/ai-source-analysis.schema';
import { ManagedCalendarEvent } from '../../database/schemas/managed-calendar-event.schema';
import { Organization } from '../../database/schemas/organization.schema';
import { PlatformMeeting } from '../../database/schemas/platform-meeting.schema';
import { TaskItem } from '../../database/schemas/task-item.schema';
import { User } from '../../database/schemas/user.schema';
import { StrategicNote } from '../../database/schemas/strategic-note.schema';
import { AgentActivityService } from '../ai-telemetry/agent-activity.service';
import { executiveBriefingPeriod } from './executive-briefing-period';
import {
  BriefingFact,
  BriefingFactGroup,
  ExecutiveBriefingAiRequest,
  ExecutiveBriefingFacts,
  PreparedExecutiveBriefing,
} from './executive-briefing.types';

@Injectable()
export class ExecutiveBriefingFactsService {
  constructor(
    @InjectModel(Organization.name)
    private readonly organizations: Model<Organization>,
    @InjectModel(User.name)
    private readonly users: Model<User>,
    @InjectModel(Agent.name)
    private readonly agents: Model<Agent>,
    @InjectModel(TaskItem.name)
    private readonly tasks: Model<TaskItem>,
    @InjectModel(PlatformMeeting.name)
    private readonly meetings: Model<PlatformMeeting>,
    @InjectModel(ManagedCalendarEvent.name)
    private readonly calendarEvents: Model<ManagedCalendarEvent>,
    @InjectModel(AiActionProposal.name)
    private readonly proposals: Model<AiActionProposal>,
    @InjectModel(AiSourceAnalysis.name)
    private readonly analyses: Model<AiSourceAnalysis>,
    @InjectModel(StrategicNote.name)
    private readonly strategicNotes: Model<StrategicNote>,
    private readonly activities: AgentActivityService,
  ) {}

  async prepare(
    organizationId: string,
    requesterUserId: string,
    type: ExecutiveBriefingType,
    asOf = new Date(),
  ): Promise<PreparedExecutiveBriefing> {
    const [organization, requester] = await Promise.all([
      this.organizations
        .findOne({ _id: organizationId, status: 'ACTIVE' })
        .lean()
        .exec(),
      this.users
        .findOne({ _id: requesterUserId, organizationId })
        .lean()
        .exec(),
    ]);
    if (!organization) throw new NotFoundException('Organization not found');
    if (!requester) throw new NotFoundException('Requester not found');

    const timezone = requester.timezone || organization.timezone || 'UTC';
    const period = executiveBriefingPeriod(type, asOf, timezone);
    const start = new Date(period.start);
    const end = new Date(period.end);
    const activityEnd = new Date(Math.min(end.getTime(), asOf.getTime()));
    const [
      taskRows,
      meetingRows,
      calendarRows,
      proposalRows,
      analysisRows,
      agents,
      activityRows,
      aiHealth,
      strategicNoteRows,
    ] = await Promise.all([
      this.tasks
        .find({
          organizationId,
          $or: [
            { dueDate: { $gte: start, $lt: end } },
            { updatedAt: { $gte: start, $lt: end } },
            { status: { $in: [TaskStatus.BLOCKED, TaskStatus.WAITING] } },
          ],
        })
        .select(
          'title description assignedToUserId department priority status dueDate estimatedDurationMinutes dependencies subtasks tags createdAt updatedAt',
        )
        .sort({ dueDate: 1, updatedAt: -1, _id: -1 })
        .limit(100)
        .lean()
        .exec(),
      this.meetings
        .find({ organizationId, startsAt: { $gte: start, $lt: end } })
        .select(
          'platform title agenda startsAt endsAt durationMinutes timezone status botRequested createdAt updatedAt',
        )
        .sort({ startsAt: 1, _id: 1 })
        .limit(100)
        .lean()
        .exec(),
      this.calendarEvents
        .find({ organizationId, startsAt: { $gte: start, $lt: end } })
        .select(
          'provider title description meetingType urgency startsAt endsAt timezone status createdAt updatedAt',
        )
        .sort({ startsAt: 1, _id: 1 })
        .limit(100)
        .lean()
        .exec(),
      this.proposals
        .find({
          organizationId,
          $or: [
            { updatedAt: { $gte: start, $lt: end } },
            {
              status: {
                $in: [
                  AiActionProposalStatus.NEEDS_CLARIFICATION,
                  AiActionProposalStatus.PENDING,
                  AiActionProposalStatus.FAILED,
                ],
              },
            },
          ],
        })
        .select(
          'proposalId actionType proposedByAgent source payload confidence clarificationQuestions clarificationAnswers status targetResourceType targetResourceId executionError createdAt updatedAt',
        )
        .sort({ updatedAt: -1, _id: -1 })
        .limit(100)
        .lean()
        .exec(),
      this.analyses
        .find({ organizationId, updatedAt: { $gte: start, $lt: end } })
        .select(
          'source summary overallConfidence sentimentAnalysis customerIntelligence patternDetection classifiedSegments createdAt updatedAt',
        )
        .sort({ updatedAt: -1, _id: -1 })
        .limit(50)
        .lean()
        .exec(),
      this.agents
        .find({ status: AgentStatus.ACTIVE })
        .select('name type status')
        .sort({ type: 1, name: 1 })
        .limit(50)
        .lean()
        .exec(),
      this.activities.list(
        organizationId,
        { from: start, to: activityEnd },
        100,
      ),
      this.activities.healthSnapshot(organizationId, {
        from: start,
        to: activityEnd,
      }),
      this.strategicNotes
        .find({
          organizationId,
          deletedAt: { $exists: false },
          appliesTo: type,
          validFrom: { $lt: end },
          $or: [
            { validUntil: { $exists: false } },
            { validUntil: { $gte: start } },
          ],
        })
        .select(
          'createdByUserId content appliesTo validFrom validUntil createdAt updatedAt',
        )
        .sort({ validFrom: -1, createdAt: -1, _id: -1 })
        .limit(20)
        .lean()
        .exec(),
    ]);

    const taskFacts = taskRows.map((task) =>
      this.fact('task', 'TASK', task, {
        title: task.title,
        description: this.text(task.description, 2_000),
        assignedToUserId: task.assignedToUserId,
        department: task.department,
        priority: task.priority,
        status: task.status,
        dueDate: this.iso(task.dueDate),
        estimatedDurationMinutes: task.estimatedDurationMinutes,
        dependencies: Array.isArray(task.dependencies)
          ? task.dependencies.slice(0, 25)
          : [],
        subtasks: Array.isArray(task.subtasks)
          ? task.subtasks.slice(0, 25)
          : [],
        tags: Array.isArray(task.tags) ? task.tags.slice(0, 20) : [],
      }),
    );
    const meetingFacts = [
      ...meetingRows.map((meeting) =>
        this.fact('meeting', 'PLATFORM_MEETING', meeting, {
          platform: meeting.platform,
          title: meeting.title,
          agenda: this.text(meeting.agenda, 2_000),
          startsAt: this.iso(meeting.startsAt),
          endsAt: this.iso(meeting.endsAt),
          durationMinutes: meeting.durationMinutes,
          timezone: meeting.timezone,
          status: meeting.status,
          botRequested: meeting.botRequested,
        }),
      ),
      ...calendarRows.map((event) =>
        this.fact('calendar-event', 'CALENDAR_EVENT', event, {
          provider: event.provider,
          title: event.title,
          description: this.text(event.description, 2_000),
          meetingType: event.meetingType,
          urgency: event.urgency,
          startsAt: this.iso(event.startsAt),
          endsAt: this.iso(event.endsAt),
          timezone: event.timezone,
          status: event.status,
        }),
      ),
    ];
    const proposalFacts = proposalRows.map((proposal) =>
      this.fact('proposal', 'AI_ACTION_PROPOSAL', proposal, {
        proposalId: proposal.proposalId,
        actionType: proposal.actionType,
        proposedByAgent: proposal.proposedByAgent,
        source: proposal.source,
        payload: proposal.payload,
        confidence: proposal.confidence,
        clarificationQuestions: proposal.clarificationQuestions,
        clarificationAnswers: proposal.clarificationAnswers,
        status: proposal.status,
        targetResourceType: proposal.targetResourceType,
        targetResourceId: proposal.targetResourceId,
        executionError: this.text(proposal.executionError, 1_000),
      }),
    );
    const analysisFacts = analysisRows.map((analysis) =>
      this.fact('analysis', 'AI_SOURCE_ANALYSIS', analysis, {
        source: analysis.source,
        summary: this.text(analysis.summary, 5_000),
        overallConfidence: analysis.overallConfidence,
        sentimentAnalysis: analysis.sentimentAnalysis,
        customerIntelligence: analysis.customerIntelligence,
        patternDetection: analysis.patternDetection,
        classifiedSegments: Array.isArray(analysis.classifiedSegments)
          ? analysis.classifiedSegments.slice(0, 50)
          : [],
      }),
    );
    const activityFacts = activityRows.map((activity) =>
      this.fact(
        'agent-activity',
        'AGENT_ACTIVITY',
        activity as unknown as Record<string, unknown>,
        {
          agentId: activity.agentId,
          agentName: activity.agentName,
          agentType: activity.agentType,
          operationType: activity.operationType,
          jobId: activity.jobId,
          runId: activity.runId,
          sourceType: activity.sourceType,
          sourceId: activity.sourceId,
          status: activity.status,
          startedAt: this.iso(activity.startedAt),
          completedAt: this.iso(activity.completedAt),
          latencyMs: activity.latencyMs,
          attempt: activity.attempt,
          failureCode: activity.failureCode,
          failureMessage: this.text(activity.failureMessage, 1_000),
          metadata: activity.metadata,
        },
      ),
    );
    const aiHealthFacts: BriefingFact[] = [
      {
        id: `ai-health-${period.start}-${period.end}`,
        sourceType: 'AI_RUNTIME_HEALTH',
        sourceId: `runtime-health:${period.start}:${period.end}`,
        capturedAt: activityEnd.toISOString(),
        data: {
          ...aiHealth,
          derivation:
            'Calculated from persisted AI runtime activity; this is not a model-accuracy score.',
        },
      },
    ];
    const strategicNoteFacts = strategicNoteRows.map((note) =>
      this.fact(
        'strategic-note',
        'STRATEGIC_NOTE',
        note as unknown as Record<string, unknown>,
        {
          createdByUserId: note.createdByUserId,
          content: this.text(note.content, 5_000),
          appliesTo: note.appliesTo,
          validFrom: this.iso(note.validFrom),
          validUntil: this.iso(note.validUntil),
        },
      ),
    );
    const marketingFacts = taskRows
      .filter((task) => task.department === TaskDepartment.MARKETING)
      .map((task) =>
        this.fact('marketing-task', 'TASK', task, {
          title: task.title,
          status: task.status,
          priority: task.priority,
          dueDate: this.iso(task.dueDate),
        }),
      );
    const productDesignFacts = taskRows
      .filter((task) => task.department === TaskDepartment.DESIGN)
      .map((task) =>
        this.fact('design-task', 'TASK', task, {
          title: task.title,
          status: task.status,
          priority: task.priority,
          dueDate: this.iso(task.dueDate),
        }),
      );
    const unavailable = (): BriefingFactGroup => ({
      availability: BriefingFactAvailability.UNAVAILABLE,
      items: [],
    });
    const facts: ExecutiveBriefingFacts = {
      tasks: this.available(taskFacts),
      meetings: this.available(meetingFacts),
      actionProposals: this.available(proposalFacts),
      sourceAnalyses: {
        availability: BriefingFactAvailability.PARTIAL,
        items: analysisFacts,
      },
      agentActivity: this.available(activityFacts),
      sales: unavailable(),
      customers: unavailable(),
      support: unavailable(),
      finance: unavailable(),
      vendors: unavailable(),
      marketing: {
        availability: BriefingFactAvailability.PARTIAL,
        items: marketingFacts,
      },
      productDesign: {
        availability: BriefingFactAvailability.PARTIAL,
        items: productDesignFacts,
      },
      roi: unavailable(),
      aiQuality: {
        availability:
          aiHealth.completedRuns > 0
            ? BriefingFactAvailability.AVAILABLE
            : BriefingFactAvailability.PARTIAL,
        items: aiHealthFacts,
      },
      strategicNotes: this.available(strategicNoteFacts),
    };
    const scopeHash = this.scopeHash(
      organizationId,
      requesterUserId,
      requester.role,
    );
    const inputIdentity = {
      schemaVersion: '1.0',
      organizationId,
      briefingType: type,
      period,
      requester: { userId: requesterUserId, scopeHash },
      organization: {
        name: organization.name,
        industry: organization.industry,
      },
      agents: agents.map((agent) => ({
        id: String(agent._id),
        name: agent.name,
        type: agent.type,
        status: agent.status,
      })),
      facts,
    };
    const inputHash = this.hash(this.stableStringify(inputIdentity));
    const shortScope = scopeHash.slice(0, 12);
    const shortInput = inputHash.slice(0, 16);
    const periodKey = period.start.slice(0, 10);
    const jobId = `briefing-${organizationId}-${shortScope}-${type.toLowerCase()}-${periodKey}-${shortInput}`;
    const idempotencyKey = `${jobId}-${inputHash}`;
    const input: ExecutiveBriefingAiRequest = {
      ...inputIdentity,
      schemaVersion: '1.0',
      jobId,
      idempotencyKey,
      requester: {
        userId: requesterUserId,
        name: `${requester.firstName} ${requester.lastName}`.trim(),
        language: requester.language || organization.language || 'en',
        scopeHash,
      },
      organization: {
        name: organization.name,
        ...(organization.industry ? { industry: organization.industry } : {}),
      },
      agents: inputIdentity.agents,
      generatedAt: new Date().toISOString(),
    };
    return { input, inputHash, requesterScopeHash: scopeHash };
  }

  scopeHash(organizationId: string, userId: string, role: UserRole) {
    return this.hash(this.stableStringify({ organizationId, userId, role }));
  }

  private available(items: BriefingFact[]): BriefingFactGroup {
    return { availability: BriefingFactAvailability.AVAILABLE, items };
  }

  private fact(
    prefix: string,
    sourceType: string,
    source: Record<string, unknown>,
    data: Record<string, unknown>,
  ): BriefingFact {
    const sourceId = String(source._id);
    return {
      id: `${prefix}-${sourceId}`,
      sourceType,
      sourceId,
      capturedAt:
        this.iso(source.updatedAt) ||
        this.iso(source.createdAt) ||
        new Date(0).toISOString(),
      data,
    };
  }

  private iso(value: unknown) {
    if (value instanceof Date) return value.toISOString();
    if (typeof value === 'string' && !Number.isNaN(Date.parse(value))) {
      return new Date(value).toISOString();
    }
    return undefined;
  }

  private text(value: unknown, maxLength: number) {
    return typeof value === 'string' ? value.slice(0, maxLength) : undefined;
  }

  private stableStringify(value: unknown): string {
    if (Array.isArray(value)) {
      return `[${value.map((item) => this.stableStringify(item)).join(',')}]`;
    }
    if (value && typeof value === 'object') {
      return `{${Object.entries(value as Record<string, unknown>)
        .filter(([, entry]) => entry !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(
          ([key, entry]) =>
            `${JSON.stringify(key)}:${this.stableStringify(entry)}`,
        )
        .join(',')}}`;
    }
    return JSON.stringify(value);
  }

  private hash(value: string) {
    return crypto.createHash('sha256').update(value).digest('hex');
  }
}
