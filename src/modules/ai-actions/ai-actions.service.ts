import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate, ValidationError } from 'class-validator';
import crypto from 'crypto';
import { isValidObjectId } from 'mongoose';
import { AgentType } from '../../common/enums/agent-type.enum';
import { assertValidTimezone } from '../../common/helpers/timezone.helper';
import { TranscriptInsightCategory } from '../../database/schemas/ai-source-analysis.schema';
import {
  AiActionProposal,
  AiActionProposalStatus,
  AiActionTargetType,
  AiActionType,
} from '../../database/schemas/ai-action-proposal.schema';
import { RequestUser } from '../../common/types/request-context.type';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { PlatformMeetingsService } from '../meeting-bots/platform-meetings.service';
import { TasksService } from '../tasks/tasks.service';
import { UsersService } from '../users/users.service';
import { OrganizationsService } from '../organizations/organizations.service';
import { AiActionsRepository } from './ai-actions.repository';
import {
  AiMeetingActionPayloadDto,
  AiTaskActionPayloadDto,
} from './dto/create-ai-action-proposal.dto';
import { ListAiActionProposalsQueryDto } from './dto/list-ai-action-proposals-query.dto';
import { GetActionCenterQueryDto } from './dto/get-action-center-query.dto';
import {
  AiAnalysisAction,
  AiAnalysisSummary,
  AiAnalysisResult,
} from './dto/ai-analysis-result.dto';
import { SourceAnalysesRepository } from '../source-analyses/source-analyses.repository';

type StoredProposal = AiActionProposal & {
  _id: unknown;
  proposalHash?: string;
  createdAt?: Date;
  updatedAt?: Date;
};

type IngestAnalysisOptions = {
  conversationId?: string;
  effectiveTimezone?: string;
  expectedRequestId?: string;
};

@Injectable()
export class AiActionsService {
  constructor(
    private readonly repository: AiActionsRepository,
    private readonly tasks: TasksService,
    private readonly meetings: PlatformMeetingsService,
    private readonly users: UsersService,
    private readonly organizations: OrganizationsService,
    private readonly auditLogs: AuditLogsService,
    private readonly sourceAnalyses: SourceAnalysesRepository,
  ) {}

  /**
   * Persists the JSON returned by the AI service. This is intentionally an
   * internal method: the AI service has no Main Backend write endpoint.
   */
  async ingestAnalysis(
    organizationId: string,
    source: { type: AiActionProposal['source']['type']; id: string },
    result: AiAnalysisResult,
    options: IngestAnalysisOptions = {},
  ) {
    const organization = await this.organizations.findCurrent(organizationId);
    const requestId = this.validateAnalysisIdentity(
      source,
      result,
      options.expectedRequestId,
    );
    const actions = this.normalizeActions(result.actions);
    const analysis = this.normalizeAnalysis(result.analysis, actions);
    const proposalAnalysis = this.proposalAnalysis(analysis);
    const items = await Promise.all(
      actions.map((action) =>
        this.storeAnalysisAction(
          organizationId,
          source,
          requestId,
          action,
          proposalAnalysis,
          options.conversationId,
          options.effectiveTimezone || organization.timezone,
        ),
      ),
    );
    await this.sourceAnalyses.upsert(
      organizationId,
      requestId,
      source,
      analysis as unknown as Record<string, unknown>,
    );
    return items;
  }

  async answerClarification(
    organizationId: string,
    id: string,
    questionId: string,
    answer: string,
  ) {
    const proposal = await this.getStored(organizationId, id);
    if (proposal.status !== AiActionProposalStatus.NEEDS_CLARIFICATION) {
      throw new ConflictException(
        `Only a clarification proposal can be answered; current status is ${proposal.status}`,
      );
    }
    const question = proposal.clarificationQuestions?.find(
      (item) => item.id === questionId,
    );
    if (!question) throw new BadRequestException('Unknown clarification question');
    const updated = await this.repository.startClarificationRefinement(
      organizationId,
      id,
      { ...proposal.clarificationAnswers, [questionId]: answer },
    );
    if (!updated) {
      throw new ConflictException('The clarification response could not be saved');
    }
    return this.toResponse(updated as StoredProposal);
  }

  async applyClarificationResult(
    organizationId: string,
    id: string,
    action: AiAnalysisAction,
  ) {
    const proposal = await this.getStored(organizationId, id);
    if (proposal.status !== AiActionProposalStatus.ANALYZING) {
      throw new ConflictException('The proposal is not awaiting an AI response');
    }
    if (action.actionType !== proposal.actionType) {
      throw new BadRequestException('AI cannot change a proposal action type');
    }
    const actionId = this.normalizeActionId(action.actionId);
    if (proposal.proposalId !== `${proposal.requestId}:${actionId}`) {
      throw new BadRequestException(
        'AI cannot change a proposal action identifier during refinement',
      );
    }
    const organization = await this.organizations.findCurrent(organizationId);
    const proposalTimezone =
      typeof proposal.payload?.timezone === 'string'
        ? proposal.payload.timezone
        : undefined;
    return this.updateAnalysisAction(
      proposal,
      { ...action, actionId },
      proposalTimezone || organization.timezone,
    );
  }

  async list(organizationId: string, query: ListAiActionProposalsQueryDto) {
    const result = await this.repository.list(
      organizationId,
      query.page,
      query.limit,
      {
        status: query.status,
        actionType: query.actionType,
        proposedByAgentId: query.proposedByAgentId?.trim(),
      },
    );
    return {
      ...result,
      items: result.items.map((item) =>
        this.toResponse(item as StoredProposal),
      ),
    };
  }

  async getActionCenter(
    organizationId: string,
    sourceId: string,
    query: GetActionCenterQueryDto,
  ) {
    const result = await this.repository.getActionCenter(
      organizationId,
      sourceId,
      query,
    );
    return {
      sourceId,
      sourceType: query.sourceType,
      status: query.status,
      limits: {
        priorityTasks: query.taskLimit,
        meetingSchedules: query.meetingLimit,
      },
      totals: result.totals,
      priorityTasks: result.priorityTasks.map((proposal) =>
        this.toActionCenterTask(proposal as StoredProposal),
      ),
      meetingSchedules: result.meetingSchedules.map((proposal) =>
        this.toActionCenterMeeting(proposal as StoredProposal),
      ),
    };
  }

  async get(organizationId: string, id: string) {
    const proposal = await this.getStored(organizationId, id);
    return this.toResponse(proposal);
  }

  async approve(organizationId: string, actor: RequestUser, id: string) {
    this.assertObjectId(id);
    const reviewer = this.reviewer(actor);
    const approvedNow = await this.repository.approvePending(
      organizationId,
      id,
      reviewer,
    );
    const newlyApproved = Boolean(approvedNow);
    let approved: StoredProposal;
    if (approvedNow) {
      approved = approvedNow as StoredProposal;
    } else {
      const current = await this.getStored(organizationId, id);
      if (current.status === AiActionProposalStatus.EXECUTED) {
        return { ...this.toResponse(current), duplicate: true };
      }
      if (current.status !== AiActionProposalStatus.APPROVED) {
        throw new ConflictException(
          `Only a PENDING proposal can be approved; current status is ${current.status}`,
        );
      }
      approved = current;
    }

    if (newlyApproved) {
      await this.auditLogs
        .create({
          organizationId,
          userId: actor.id,
          action: 'AI_ACTION_PROPOSAL_APPROVED',
          resourceType: 'AiActionProposal',
          resourceId: id,
          metadata: { actionType: approved.actionType },
        })
        .catch(() => undefined);
    }
    const claimed = await this.repository.claimApprovedForExecution(
      organizationId,
      id,
    );
    if (!claimed) {
      const current = await this.getStored(organizationId, id);
      if (current.status === AiActionProposalStatus.EXECUTED) {
        return { ...this.toResponse(current), duplicate: true };
      }
      throw new ConflictException(
        `The approved proposal cannot be executed while its status is ${current.status}`,
      );
    }
    return this.execute(
      claimed as StoredProposal,
      claimed.approvedByUserId as string,
    );
  }

  async retry(organizationId: string, actor: RequestUser, id: string) {
    this.assertObjectId(id);
    const claimed = await this.repository.claimFailedForRetry(
      organizationId,
      id,
    );
    if (!claimed) {
      const current = await this.getStored(organizationId, id);
      throw new ConflictException(
        `Only an approved FAILED proposal can be retried; current status is ${current.status}`,
      );
    }
    await this.auditLogs
      .create({
        organizationId,
        userId: actor.id,
        action: 'AI_ACTION_PROPOSAL_RETRY_STARTED',
        resourceType: 'AiActionProposal',
        resourceId: id,
        metadata: { actionType: claimed.actionType },
      })
      .catch(() => undefined);
    return this.execute(
      claimed as StoredProposal,
      claimed.approvedByUserId as string,
    );
  }

  async reject(
    organizationId: string,
    actor: RequestUser,
    id: string,
    reason: string,
  ) {
    this.assertObjectId(id);
    const rejected = await this.repository.rejectPending(
      organizationId,
      id,
      this.reviewer(actor),
      reason,
    );
    if (!rejected) {
      const current = await this.getStored(organizationId, id);
      throw new ConflictException(
        `Only a PENDING proposal can be rejected; current status is ${current.status}`,
      );
    }
    await this.auditLogs
      .create({
        organizationId,
        userId: actor.id,
        action: 'AI_ACTION_PROPOSAL_REJECTED',
        resourceType: 'AiActionProposal',
        resourceId: id,
        metadata: { actionType: rejected.actionType, reason },
      })
      .catch(() => undefined);
    return this.toResponse(rejected as StoredProposal);
  }

  private async execute(proposal: StoredProposal, creatorUserId: string) {
    const proposalId = String(proposal._id);
    try {
      const payload = await this.validatePayload(
        proposal.actionType,
        proposal.payload,
      );
      let target: { type: AiActionTargetType; id: string };
      if (proposal.actionType === AiActionType.CREATE_TASK) {
        const taskPayload = payload as AiTaskActionPayloadDto;
        await this.assertValidAssignee(
          proposal.organizationId,
          taskPayload.assignedToUserId,
        );
        const task = await this.tasks.createFromAiProposal(
          proposal.organizationId,
          creatorUserId,
          taskPayload,
          {
            aiActionProposalId: proposalId,
            proposedByAgent: proposal.proposedByAgent,
          },
        );
        target = { type: AiActionTargetType.TASK, id: task.id };
      } else {
        const meetingPayload = payload as AiMeetingActionPayloadDto;
        const meeting = await this.meetings.createFromAiProposal(
          proposal.organizationId,
          creatorUserId,
          meetingPayload,
          {
            aiActionProposalId: proposalId,
            proposedByAgent: proposal.proposedByAgent,
            proposalId: proposal.proposalId,
          },
        );
        target = {
          type: AiActionTargetType.PLATFORM_MEETING,
          id: meeting.id,
        };
      }

      const executed = await this.repository.markExecuted(
        proposal.organizationId,
        proposalId,
        target,
      );
      if (!executed) {
        throw new ConflictException(
          'The proposal execution state changed unexpectedly',
        );
      }
      await this.auditLogs
        .create({
          organizationId: proposal.organizationId,
          userId: creatorUserId,
          action: 'AI_ACTION_PROPOSAL_EXECUTED',
          resourceType: target.type,
          resourceId: target.id,
          metadata: { proposalId, actionType: proposal.actionType },
        })
        .catch(() => undefined);
      return {
        proposal: this.toResponse(executed as StoredProposal),
        target,
      };
    } catch (error) {
      const message = this.errorMessage(error);
      await this.repository
        .markFailed(proposal.organizationId, proposalId, message)
        .catch(() => undefined);
      await this.auditLogs
        .create({
          organizationId: proposal.organizationId,
          userId: creatorUserId,
          action: 'AI_ACTION_PROPOSAL_EXECUTION_FAILED',
          resourceType: 'AiActionProposal',
          resourceId: proposalId,
          metadata: { actionType: proposal.actionType, error: message },
        })
        .catch(() => undefined);
      throw error;
    }
  }

  private async storeAnalysisAction(
    organizationId: string,
    source: AiActionProposal['source'],
    requestId: string,
    action: AiAnalysisAction,
    analysis: AiAnalysisSummary,
    conversationId?: string,
    effectiveTimezone?: string,
  ) {
    if (!Object.values(AiActionType).includes(action.actionType)) {
      throw new BadRequestException('AI returned an unsupported action type');
    }
    const proposalId = `${requestId}:${action.actionId}`;
    const questions = this.normalizedQuestions(action.clarificationQuestions);
    const status = questions.length
      ? AiActionProposalStatus.NEEDS_CLARIFICATION
      : AiActionProposalStatus.PENDING;
    const timezoneAwarePayload = this.withEffectiveTimezone(
      action.actionType,
      action.payload,
      effectiveTimezone,
    );
    const payload = questions.length
      ? timezoneAwarePayload
      : await this.validatePayload(
          action.actionType,
          timezoneAwarePayload,
          effectiveTimezone,
        );
    const normalized = {
      organizationId,
      schemaVersion: '1.0',
      proposalId,
      requestId,
      ...(conversationId ? { conversationId } : {}),
      actionType: action.actionType,
      proposedByAgent: this.normalizeAgent(action.proposedByAgent),
      source,
      payload,
      confidence: action.confidence,
      evidence: action.evidence || [],
      analysis,
      clarificationQuestions: questions,
      clarificationAnswers: {},
      revision: 1,
      status,
    };
    const proposalHash = this.hash(this.stableStringify(normalized));
    const existing = await this.repository.findByProposalIdWithHash(
      organizationId,
      proposalId,
    );
    if (existing) {
      if (existing.proposalHash !== proposalHash) {
        throw new ConflictException(
          'The AI action identifier was reused with different content',
        );
      }
      return { ...this.toResponse(existing as StoredProposal), duplicate: true };
    }
    try {
      const created = await this.repository.create({ ...normalized, proposalHash });
      return { ...this.toResponse(created as StoredProposal), duplicate: false };
    } catch (error) {
      if (!this.isDuplicateKey(error)) throw error;
      const raced = await this.repository.findByProposalIdWithHash(
        organizationId,
        proposalId,
      );
      if (!raced || raced.proposalHash !== proposalHash) throw error;
      return { ...this.toResponse(raced as StoredProposal), duplicate: true };
    }
  }

  private async updateAnalysisAction(
    proposal: StoredProposal,
    action: AiAnalysisAction,
    effectiveTimezone?: string,
  ) {
    const questions = this.normalizedQuestions(action.clarificationQuestions);
    const timezoneAwarePayload = this.withEffectiveTimezone(
      action.actionType,
      action.payload,
      effectiveTimezone,
    );
    const payload = questions.length
      ? timezoneAwarePayload
      : await this.validatePayload(
          action.actionType,
          timezoneAwarePayload,
          effectiveTimezone,
        );
    const next = await this.repository.applyClarificationResult(
      proposal.organizationId,
      String(proposal._id),
      {
        payload: payload as Record<string, unknown>,
        confidence: action.confidence,
        evidence: action.evidence || [],
        proposedByAgent: this.normalizeAgent(action.proposedByAgent),
        clarificationQuestions: questions,
        status: questions.length
          ? AiActionProposalStatus.NEEDS_CLARIFICATION
          : AiActionProposalStatus.PENDING,
      },
    );
    if (!next) throw new ConflictException('The AI clarification result was not saved');
    return this.toResponse(next as StoredProposal);
  }

  private normalizedQuestions(
    questions: AiAnalysisAction['clarificationQuestions'],
  ) {
    if (!questions?.length) return [];
    if (questions.length > 10) {
      throw new BadRequestException('AI returned too many clarification questions');
    }
    const ids = new Set<string>();
    return questions.map((question) => {
      const id = question.id?.trim();
      const field = question.field?.trim();
      const text = question.question?.trim();
      if (!id || !field || !text || id.length > 128 || field.length > 200 || text.length > 2000 || ids.has(id)) {
        throw new BadRequestException('AI returned an invalid clarification question');
      }
      ids.add(id);
      return {
        id,
        field,
        question: text,
        ...(question.inputType?.trim() ? { inputType: question.inputType.trim() } : {}),
        required: question.required !== false,
      };
    });
  }

  private validateAnalysisIdentity(
    source: AiActionProposal['source'],
    result: AiAnalysisResult,
    expectedRequestId?: string,
  ) {
    const requestId = result?.requestId?.trim();
    if (!requestId || requestId.length > 200) {
      throw new BadRequestException(
        'AI response requestId is required and must not exceed 200 characters',
      );
    }
    if (expectedRequestId && requestId !== expectedRequestId) {
      throw new BadRequestException(
        'AI response requestId does not match the submitted jobId',
      );
    }
    if (
      !result.source ||
      result.source.type !== source.type ||
      result.source.id !== source.id
    ) {
      throw new BadRequestException(
        'AI response source does not match the submitted source',
      );
    }
    return requestId;
  }

  private normalizeActions(actions: AiAnalysisResult['actions']) {
    if (!Array.isArray(actions)) {
      throw new BadRequestException('AI response actions must be an array');
    }
    const actionIds = new Set<string>();
    return actions.map((action) => {
      const actionId = this.normalizeActionId(action?.actionId);
      if (
        typeof action?.confidence !== 'number' ||
        !Number.isFinite(action.confidence) ||
        action.confidence < 0 ||
        action.confidence > 1
      ) {
        throw new BadRequestException(
          'AI action confidence must be a number from 0 to 1',
        );
      }
      if (actionIds.has(actionId)) {
        throw new BadRequestException(
          'AI returned duplicate actionId values in one response',
        );
      }
      actionIds.add(actionId);
      return { ...action, actionId };
    });
  }

  private normalizeActionId(value?: string) {
    const actionId = value?.trim();
    if (!actionId || actionId.length > 128) {
      throw new BadRequestException(
        'AI actionId is required and must not exceed 128 characters',
      );
    }
    return actionId;
  }

  private normalizeAnalysis(
    analysis: AiAnalysisSummary,
    actions: AiAnalysisAction[],
  ) {
    const score = analysis?.sentimentAnalysis?.score;
    const intelligence = analysis?.customerIntelligence;
    const patterns = analysis?.patternDetection;
    const requiredValues = [
      score?.positive,
      score?.neutral,
      score?.negative,
      intelligence?.healthScore,
    ];
    const optionalPatternValues = patterns
      ? Object.values(patterns).filter((value) => value !== undefined)
      : [];
    if (
      !score ||
      !intelligence ||
      !patterns ||
      requiredValues.some(
        (value) =>
          typeof value !== 'number' ||
          !Number.isFinite(value) ||
          value < 0 ||
          value > 100,
      ) ||
      optionalPatternValues.some(
        (value) =>
          typeof value !== 'number' ||
          !Number.isFinite(value) ||
          value < 0 ||
          value > 100,
      ) ||
      Math.abs(
        (score?.positive || 0) +
          (score?.neutral || 0) +
          (score?.negative || 0) -
          100,
      ) > 0.01 ||
      !intelligence.riskLevel?.trim()
    ) {
      throw new BadRequestException(
        'AI returned an invalid analysis summary',
      );
    }
    const summary = analysis.summary?.trim();
    if (summary && summary.length > 10_000) {
      throw new BadRequestException('AI summary exceeds 10000 characters');
    }
    const derivedConfidence = actions.length
      ? actions.reduce((total, action) => total + action.confidence, 0) /
        actions.length
      : undefined;
    const overallConfidence =
      analysis.overallConfidence ?? derivedConfidence;
    if (
      overallConfidence !== undefined &&
      (typeof overallConfidence !== 'number' ||
        !Number.isFinite(overallConfidence) ||
        overallConfidence < 0 ||
        overallConfidence > 1)
    ) {
      throw new BadRequestException(
        'AI overallConfidence must be a number from 0 to 1',
      );
    }
    const classifiedSegments = this.normalizeClassifiedSegments(
      analysis.classifiedSegments,
    );
    return {
      ...(summary ? { summary } : {}),
      ...(overallConfidence !== undefined ? { overallConfidence } : {}),
      sentimentAnalysis: {
        score: {
          positive: score.positive,
          neutral: score.neutral,
          negative: score.negative,
        },
      },
      customerIntelligence: {
        healthScore: intelligence.healthScore,
        riskLevel: intelligence.riskLevel.trim().toUpperCase(),
      },
      patternDetection: Object.fromEntries(
        Object.entries(patterns).filter(([, value]) => value !== undefined),
      ),
      classifiedSegments,
    };
  }

  private normalizeClassifiedSegments(
    segments: AiAnalysisSummary['classifiedSegments'],
  ) {
    if (!segments?.length) return [];
    if (segments.length > 500) {
      throw new BadRequestException(
        'AI returned too many classified transcript segments',
      );
    }
    const ids = new Set<string>();
    return segments.map((segment) => {
      const id = segment.id?.trim();
      const text = segment.text?.trim();
      if (
        !id ||
        id.length > 128 ||
        ids.has(id) ||
        !text ||
        text.length > 5000 ||
        !Object.values(TranscriptInsightCategory).includes(segment.category)
      ) {
        throw new BadRequestException(
          'AI returned an invalid classified transcript segment',
        );
      }
      const numericValues = [
        segment.startTimeSeconds,
        segment.endTimeSeconds,
      ].filter((value) => value !== undefined);
      if (
        numericValues.some(
          (value) =>
            typeof value !== 'number' || !Number.isFinite(value) || value < 0,
        ) ||
        (segment.confidence !== undefined &&
          (typeof segment.confidence !== 'number' ||
            !Number.isFinite(segment.confidence) ||
            segment.confidence < 0 ||
            segment.confidence > 1)) ||
        (segment.startTimeSeconds !== undefined &&
          segment.endTimeSeconds !== undefined &&
          segment.endTimeSeconds < segment.startTimeSeconds)
      ) {
        throw new BadRequestException(
          'AI returned invalid classified transcript segment timing or confidence',
        );
      }
      ids.add(id);
      return {
        id,
        category: segment.category,
        text,
        ...(segment.speaker?.trim()
          ? { speaker: segment.speaker.trim() }
          : {}),
        ...(segment.startTimeSeconds !== undefined
          ? { startTimeSeconds: segment.startTimeSeconds }
          : {}),
        ...(segment.endTimeSeconds !== undefined
          ? { endTimeSeconds: segment.endTimeSeconds }
          : {}),
        ...(segment.confidence !== undefined
          ? { confidence: segment.confidence }
          : {}),
      };
    });
  }

  private proposalAnalysis(analysis: ReturnType<AiActionsService['normalizeAnalysis']>) {
    return {
      sentimentAnalysis: analysis.sentimentAnalysis,
      customerIntelligence: analysis.customerIntelligence,
      patternDetection: analysis.patternDetection,
    };
  }

  private normalizeAgent(agent: AiAnalysisAction['proposedByAgent']) {
    const id = agent?.id?.trim();
    const name = agent?.name?.trim();
    if (
      !id ||
      !name ||
      id.length > 128 ||
      name.length > 200 ||
      !Object.values(AgentType).includes(agent.type)
    ) {
      throw new BadRequestException(
        'AI returned an invalid proposedByAgent; id, name, and type are required',
      );
    }
    return { id, name, type: agent.type };
  }

  private async validatePayload(
    actionType: AiActionType,
    payload: Record<string, unknown>,
    effectiveTimezone?: string,
  ): Promise<
    | AiTaskActionPayloadDto
    | AiMeetingActionPayloadDto
  > {
    const normalizedPayload = this.withEffectiveTimezone(
      actionType,
      payload,
      effectiveTimezone,
    );
    const type =
      actionType === AiActionType.CREATE_TASK
        ? AiTaskActionPayloadDto
        : AiMeetingActionPayloadDto;
    const instance = plainToInstance(type, normalizedPayload);
    const errors = await validate(instance, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });
    if (errors.length) {
      throw new BadRequestException({
        message: `${actionType} payload is invalid`,
        errors: this.validationMessages(errors),
      });
    }
    if (actionType === AiActionType.SCHEDULE_MEETING) {
      const meeting = instance as AiMeetingActionPayloadDto;
      if (!meeting.startsAt) {
        throw new BadRequestException(
          'SCHEDULE_MEETING payload requires startsAt',
        );
      }
      if (!meeting.timezone) {
        throw new BadRequestException(
          'SCHEDULE_MEETING payload requires an effective timezone',
        );
      }
      assertValidTimezone(meeting.timezone);
      if (!/(?:Z|[+-]\d{2}:\d{2})$/i.test(meeting.startsAt)) {
        throw new BadRequestException(
          'SCHEDULE_MEETING startsAt must include Z or an explicit UTC offset',
        );
      }
      meeting.startsAt = new Date(meeting.startsAt).toISOString();
    }
    return instance;
  }

  private withEffectiveTimezone(
    actionType: AiActionType,
    payload: Record<string, unknown>,
    effectiveTimezone?: string,
  ) {
    if (actionType !== AiActionType.SCHEDULE_MEETING) return payload;
    const explicitTimezone =
      typeof payload?.timezone === 'string' ? payload.timezone.trim() : '';
    const fallbackTimezone = effectiveTimezone?.trim() || '';
    const timezone = explicitTimezone || fallbackTimezone;
    if (!timezone) return { ...payload };
    assertValidTimezone(timezone);
    return { ...payload, timezone };
  }

  private async assertValidAssignee(
    organizationId: string,
    assignedToUserId?: string,
  ) {
    if (!assignedToUserId) return;
    if (!isValidObjectId(assignedToUserId)) {
      throw new BadRequestException('assignedToUserId is invalid');
    }
    const user = await this.users.findById(assignedToUserId);
    if (!user || user.organizationId !== organizationId) {
      throw new BadRequestException(
        'assignedToUserId must belong to the proposal organization',
      );
    }
  }

  private async getStored(organizationId: string, id: string) {
    this.assertObjectId(id);
    const proposal = await this.repository.findById(organizationId, id);
    if (!proposal) throw new NotFoundException('AI action proposal not found');
    return proposal as StoredProposal;
  }

  private reviewer(actor: RequestUser) {
    return {
      id: actor.id,
      name: `${actor.firstName} ${actor.lastName}`.trim(),
    };
  }

  private toResponse(proposal: StoredProposal) {
    const value =
      'toObject' in proposal && typeof proposal.toObject === 'function'
        ? (proposal.toObject() as Record<string, unknown>)
        : ({ ...proposal } as Record<string, unknown>);
    const { _id, __v, proposalHash, ...response } = value;
    void __v;
    void proposalHash;
    return { id: String(_id), ...response };
  }

  private toActionCenterTask(proposal: StoredProposal) {
    const response = this.toResponse(proposal);
    const payload = proposal.payload as Record<string, unknown>;
    return {
      ...this.actionCenterCommon(response),
      title: payload.title,
      description: payload.description,
      priority: payload.priority || 'MEDIUM',
      dueDate: payload.dueDate,
      assignedToUserId: payload.assignedToUserId,
      department: payload.department,
      estimatedDurationMinutes: payload.estimatedDurationMinutes,
      tags: payload.tags,
    };
  }

  private toActionCenterMeeting(proposal: StoredProposal) {
    const response = this.toResponse(proposal);
    const payload = proposal.payload as Record<string, unknown>;
    return {
      ...this.actionCenterCommon(response),
      title: payload.title,
      agenda: payload.agenda,
      platform: payload.platform,
      startsAt: payload.startsAt,
      durationMinutes: payload.durationMinutes,
      timezone: payload.timezone,
      invitees: payload.invitees,
    };
  }

  private actionCenterCommon(proposal: Record<string, unknown>) {
    const status = proposal.status as AiActionProposalStatus;
    return {
      id: proposal.id,
      proposalId: proposal.proposalId,
      actionType: proposal.actionType,
      proposedByAgent: proposal.proposedByAgent,
      source: proposal.source,
      confidence: proposal.confidence,
      status,
      canApprove: status === AiActionProposalStatus.PENDING,
      canReject: status === AiActionProposalStatus.PENDING,
      canRetry: status === AiActionProposalStatus.FAILED,
      targetResourceType: proposal.targetResourceType,
      targetResourceId: proposal.targetResourceId,
      executionError: proposal.executionError,
      createdAt: proposal.createdAt,
      updatedAt: proposal.updatedAt,
    };
  }

  private validationMessages(errors: ValidationError[]): string[] {
    return errors.flatMap((error) => [
      ...Object.values(error.constraints || {}),
      ...this.validationMessages(error.children || []),
    ]);
  }

  private assertObjectId(id: string) {
    if (!isValidObjectId(id)) {
      throw new BadRequestException('Invalid AI action proposal id');
    }
  }

  private stableStringify(value: unknown): string {
    if (Array.isArray(value)) {
      return `[${value.map((item) => this.stableStringify(item)).join(',')}]`;
    }
    if (value && typeof value === 'object') {
      const entries = Object.entries(value as Record<string, unknown>).sort(
        ([left], [right]) => left.localeCompare(right),
      );
      return `{${entries
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

  private errorMessage(error: unknown) {
    return (error instanceof Error ? error.message : 'Unknown error').slice(
      0,
      2000,
    );
  }

  private isDuplicateKey(error: unknown) {
    return (
      !!error &&
      typeof error === 'object' &&
      'code' in error &&
      error.code === 11000
    );
  }
}
