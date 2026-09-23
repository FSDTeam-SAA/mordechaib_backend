import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import crypto from 'crypto';
import { Model } from 'mongoose';
import { AgentStatus } from '../../common/enums/agent-status.enum';
import {
  BriefingFactAvailability,
  ExecutiveBriefingType,
  StrategicNoteKind,
} from '../../common/enums/executive-briefing.enum';
import {
  aiIsoTimestamp,
  boundedAiText,
  boundedRows,
  createAiFact,
} from '../../common/helpers/ai-fact.helper';
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

const FACT_LIMITS = {
  tasks: 100,
  meetings: 100,
  proposals: 100,
  analyses: 50,
  agents: 50,
  activities: 100,
  strategicNotes: 20,
} as const;

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
          'title description assignedToUserId department priority status dueDate completedAt estimatedDurationMinutes dependencies subtasks tags createdAt updatedAt',
        )
        .sort({ dueDate: 1, updatedAt: -1, _id: -1 })
        .limit(FACT_LIMITS.tasks + 1)
        .lean()
        .exec(),
      this.meetings
        .find({ organizationId, startsAt: { $gte: start, $lt: end } })
        .select(
          'platform title agenda startsAt endsAt durationMinutes timezone status botRequested createdAt updatedAt',
        )
        .sort({ startsAt: 1, _id: 1 })
        .limit(FACT_LIMITS.meetings + 1)
        .lean()
        .exec(),
      this.calendarEvents
        .find({ organizationId, startsAt: { $gte: start, $lt: end } })
        .select(
          'provider title description meetingType urgency startsAt endsAt timezone status createdAt updatedAt',
        )
        .sort({ startsAt: 1, _id: 1 })
        .limit(FACT_LIMITS.meetings + 1)
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
          'proposalId actionType proposedByAgent source payload confidence clarificationQuestions clarificationAnswers status targetResourceType targetResourceId executionError executedAt createdAt updatedAt',
        )
        .sort({ updatedAt: -1, _id: -1 })
        .limit(FACT_LIMITS.proposals + 1)
        .lean()
        .exec(),
      this.analyses
        .find({ organizationId, updatedAt: { $gte: start, $lt: end } })
        .select(
          'source summary overallConfidence sentimentAnalysis customerIntelligence patternDetection classifiedSegments createdAt updatedAt',
        )
        .sort({ updatedAt: -1, _id: -1 })
        .limit(FACT_LIMITS.analyses + 1)
        .lean()
        .exec(),
      this.agents
        .find({ status: AgentStatus.ACTIVE })
        .select('name type status')
        .sort({ type: 1, name: 1 })
        .limit(FACT_LIMITS.agents)
        .lean()
        .exec(),
      this.activities.list(
        organizationId,
        { from: start, to: activityEnd },
        FACT_LIMITS.activities + 1,
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
          'createdByUserId title kind content appliesTo validFrom validUntil createdAt updatedAt',
        )
        .sort({ validFrom: -1, createdAt: -1, _id: -1 })
        .limit(FACT_LIMITS.strategicNotes + 1)
        .lean()
        .exec(),
    ]);

    const boundedTasks = boundedRows(taskRows, FACT_LIMITS.tasks);
    const boundedMeetings = boundedRows(meetingRows, FACT_LIMITS.meetings);
    const boundedCalendar = boundedRows(calendarRows, FACT_LIMITS.meetings);
    const boundedProposals = boundedRows(proposalRows, FACT_LIMITS.proposals);
    const boundedAnalyses = boundedRows(analysisRows, FACT_LIMITS.analyses);
    const boundedActivities = boundedRows(activityRows, FACT_LIMITS.activities);
    const boundedNotes = boundedRows(
      strategicNoteRows,
      FACT_LIMITS.strategicNotes,
    );
    const assigneeIds = [
      ...new Set(
        boundedTasks.items
          .map((task) => task.assignedToUserId)
          .filter((id): id is string => typeof id === 'string' && !!id),
      ),
    ];
    const assignees = assigneeIds.length
      ? await this.users
          .find({ organizationId, _id: { $in: assigneeIds } })
          .select('firstName lastName')
          .lean()
          .exec()
      : [];
    const assigneeNames = new Map(
      assignees.map((user) => [
        String(user._id),
        `${user.firstName} ${user.lastName}`.trim(),
      ]),
    );

    const taskFacts = boundedTasks.items.map((task) =>
      createAiFact('task', 'TASK', task, {
        title: task.title,
        description: boundedAiText(task.description, 2_000),
        assignedToUserId: task.assignedToUserId,
        assigneeName: task.assignedToUserId
          ? assigneeNames.get(task.assignedToUserId)
          : undefined,
        department: task.department,
        priority: task.priority,
        status: task.status,
        dueDate: aiIsoTimestamp(task.dueDate),
        completedAt: aiIsoTimestamp(task.completedAt),
        updatedAt: aiIsoTimestamp(
          (task as unknown as Record<string, unknown>).updatedAt,
        ),
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
      ...boundedMeetings.items.map((meeting) =>
        createAiFact('meeting', 'PLATFORM_MEETING', meeting, {
          platform: meeting.platform,
          title: meeting.title,
          agenda: boundedAiText(meeting.agenda, 2_000),
          startsAt: aiIsoTimestamp(meeting.startsAt),
          endsAt: aiIsoTimestamp(meeting.endsAt),
          durationMinutes: meeting.durationMinutes,
          timezone: meeting.timezone,
          status: meeting.status,
          botRequested: meeting.botRequested,
        }),
      ),
      ...boundedCalendar.items.map((event) =>
        createAiFact('calendar-event', 'CALENDAR_EVENT', event, {
          provider: event.provider,
          title: event.title,
          description: boundedAiText(event.description, 2_000),
          meetingType: event.meetingType,
          urgency: event.urgency,
          startsAt: aiIsoTimestamp(event.startsAt),
          endsAt: aiIsoTimestamp(event.endsAt),
          timezone: event.timezone,
          status: event.status,
        }),
      ),
    ];
    const proposalFacts = boundedProposals.items.map((proposal) =>
      createAiFact('proposal', 'AI_ACTION_PROPOSAL', proposal, {
        proposalId: proposal.proposalId,
        title:
          proposal.payload && typeof proposal.payload === 'object'
            ? (proposal.payload as Record<string, unknown>).title
            : undefined,
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
        error: boundedAiText(proposal.executionError, 1_000),
        updatedAt: aiIsoTimestamp(
          (proposal as unknown as Record<string, unknown>).updatedAt,
        ),
        executedAt: aiIsoTimestamp(proposal.executedAt),
      }),
    );
    const analysisFacts = boundedAnalyses.items.map((analysis) =>
      createAiFact('analysis', 'AI_SOURCE_ANALYSIS', analysis, {
        title: 'AI source analysis',
        sourceType:
          analysis.source && typeof analysis.source === 'object'
            ? (analysis.source as Record<string, unknown>).type
            : undefined,
        source: analysis.source,
        summary: boundedAiText(analysis.summary, 5_000),
        analyzedAt: aiIsoTimestamp(
          (analysis as unknown as Record<string, unknown>).updatedAt,
        ),
        overallConfidence: analysis.overallConfidence,
        sentimentAnalysis: analysis.sentimentAnalysis,
        customerIntelligence: analysis.customerIntelligence,
        patternDetection: analysis.patternDetection,
        classifiedSegments: Array.isArray(analysis.classifiedSegments)
          ? analysis.classifiedSegments.slice(0, 50)
          : [],
      }),
    );
    const activityFacts = boundedActivities.items.map((activity) =>
      createAiFact(
        'agent-activity',
        'AGENT_ACTIVITY',
        activity as unknown as Record<string, unknown>,
        {
          title: `${activity.agentName || activity.agentType || 'AI agent'}: ${activity.operationType}`,
          detail:
            activity.status === 'FAILED'
              ? boundedAiText(activity.failureMessage, 1_000)
              : `AI operation ${activity.status.toLowerCase()}`,
          agentId: activity.agentId,
          agentName: activity.agentName,
          agentType: activity.agentType,
          operationType: activity.operationType,
          jobId: activity.jobId,
          runId: activity.runId,
          sourceType: activity.sourceType,
          sourceId: activity.sourceId,
          status: activity.status,
          startedAt: aiIsoTimestamp(activity.startedAt),
          completedAt: aiIsoTimestamp(activity.completedAt),
          latencyMs: activity.latencyMs,
          attempt: activity.attempt,
          failureCode: activity.failureCode,
          failureMessage: boundedAiText(activity.failureMessage, 1_000),
          metadata: activity.metadata,
        },
      ),
    );
    const healthDerivation = `Calculated from ${aiHealth.truncated ? 'the first 10,000 persisted' : 'persisted'} AI runtime activity records in the period; this is not a model-accuracy score.`;
    const healthMetrics: Array<{
      key: string;
      title: string;
      value: number | null;
      unit: 'COUNT' | 'PERCENT' | 'MINUTES';
    }> = [
      {
        key: 'total-runs',
        title: 'AI runs',
        value: aiHealth.totalRuns,
        unit: 'COUNT',
      },
      {
        key: 'completed-runs',
        title: 'Completed AI runs',
        value: aiHealth.completedRuns,
        unit: 'COUNT',
      },
      {
        key: 'succeeded',
        title: 'Successful AI runs',
        value: aiHealth.succeeded,
        unit: 'COUNT',
      },
      {
        key: 'failed',
        title: 'Failed AI runs',
        value: aiHealth.failed,
        unit: 'COUNT',
      },
      {
        key: 'running',
        title: 'Running AI jobs',
        value: aiHealth.running,
        unit: 'COUNT',
      },
      {
        key: 'skipped',
        title: 'Skipped AI jobs',
        value: aiHealth.skipped,
        unit: 'COUNT',
      },
      {
        key: 'success-rate',
        title: 'AI job success rate',
        value: aiHealth.successRatePercent,
        unit: 'PERCENT',
      },
      {
        key: 'average-latency',
        title: 'Average AI job latency',
        value:
          aiHealth.averageLatencyMs === null
            ? null
            : Number((aiHealth.averageLatencyMs / 60_000).toFixed(2)),
        unit: 'MINUTES',
      },
      {
        key: 'p95-latency',
        title: 'P95 AI job latency',
        value:
          aiHealth.p95LatencyMs === null
            ? null
            : Number((aiHealth.p95LatencyMs / 60_000).toFixed(2)),
        unit: 'MINUTES',
      },
    ];
    const aiHealthFacts: BriefingFact[] = healthMetrics
      .filter((metric) => metric.value !== null)
      .map((metric) => ({
        id: `ai-health-${metric.key}-${period.start}-${period.end}`,
        sourceType: 'DERIVED_AGGREGATE',
        sourceId: `runtime-health:${metric.key}:${period.start}:${period.end}`,
        capturedAt: activityEnd.toISOString(),
        data: {
          title: metric.title,
          value: metric.value,
          unit: metric.unit,
          derivation: healthDerivation,
        },
      }));
    const strategicNoteFacts = boundedNotes.items.map((note) =>
      createAiFact(
        'strategic-note',
        'STRATEGIC_NOTE',
        note as unknown as Record<string, unknown>,
        {
          title: note.title || 'CEO strategic note',
          kind: note.kind || StrategicNoteKind.NOTE,
          createdByUserId: note.createdByUserId,
          text: boundedAiText(note.content, 5_000),
          appliesTo: note.appliesTo,
          validFrom: aiIsoTimestamp(note.validFrom),
          validUntil: aiIsoTimestamp(note.validUntil),
        },
      ),
    );
    const marketingFacts = boundedTasks.items
      .filter((task) => task.department === TaskDepartment.MARKETING)
      .map((task) =>
        createAiFact('marketing-task', 'TASK', task, {
          title: task.title,
          status: task.status,
          priority: task.priority,
          dueDate: aiIsoTimestamp(task.dueDate),
        }),
      );
    const productDesignFacts = boundedTasks.items
      .filter((task) => task.department === TaskDepartment.DESIGN)
      .map((task) =>
        createAiFact('design-task', 'TASK', task, {
          title: task.title,
          status: task.status,
          priority: task.priority,
          dueDate: aiIsoTimestamp(task.dueDate),
        }),
      );
    const unavailable = (): BriefingFactGroup => ({
      availability: BriefingFactAvailability.UNAVAILABLE,
      items: [],
    });
    const facts: ExecutiveBriefingFacts = {
      tasks: this.available(taskFacts, boundedTasks.truncated),
      meetings: this.available(
        meetingFacts,
        boundedMeetings.truncated || boundedCalendar.truncated,
      ),
      actionProposals: this.available(
        proposalFacts,
        boundedProposals.truncated,
      ),
      sourceAnalyses: {
        availability: BriefingFactAvailability.PARTIAL,
        items: analysisFacts,
      },
      agentActivity: this.available(activityFacts, boundedActivities.truncated),
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
        availability: BriefingFactAvailability.PARTIAL,
        items: aiHealthFacts,
      },
      strategicNotes: this.available(
        strategicNoteFacts,
        boundedNotes.truncated,
      ),
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

  private available(
    items: BriefingFact[],
    truncated = false,
  ): BriefingFactGroup {
    return {
      availability: truncated
        ? BriefingFactAvailability.PARTIAL
        : BriefingFactAvailability.AVAILABLE,
      items,
    };
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
