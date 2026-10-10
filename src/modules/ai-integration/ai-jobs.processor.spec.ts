import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import { Job, UnrecoverableError } from 'bullmq';
import { AiActionsService } from '../ai-actions/ai-actions.service';
import { AiSourceContextService } from '../ai-internal/ai-source-context.service';
import { AgentActivityService } from '../ai-telemetry/agent-activity.service';
import { AiActionClarificationWorkflowService } from './ai-action-clarification-workflow.service';
import { AiAnalysisResponseValidator } from './ai-analysis-response.validator';
import { AiChatReplyService } from './ai-chat-reply.service';
import { AiJobsProcessor } from './ai-jobs.processor';
import {
  AI_ANALYZE_SOURCE_JOB,
  AI_RECOVER_ACTION_REFINEMENT_JOB,
  AI_REFINE_ACTION_JOB,
  AnalyzeSourceJob,
  RecoverActionRefinementJob,
  RefineActionJob,
} from './ai-jobs.queue';
import { AiServiceClient, AiServiceHttpError } from './ai-service.client';

describe('AiJobsProcessor user message analysis', () => {
  const organizationId = 'org-1';
  const sourceId = '507f1f77bcf86cd799439011';
  const conversationId = '507f1f77bcf86cd799439012';
  const job = {
    id: 'quotation-job',
    name: AI_ANALYZE_SOURCE_JOB,
    attemptsMade: 0,
    opts: { attempts: 3 },
    data: { organizationId, sourceType: 'USER_MESSAGE', sourceId },
  } as unknown as Job<AnalyzeSourceJob>;
  let aiService: { request: jest.Mock };
  let sourceContext: {
    sourceContext: jest.Mock;
    organizationContext: jest.Mock;
    requesterContext: jest.Mock;
    markMessageProcessed: jest.Mock;
  };
  let actions: { ingestAnalysis: jest.Mock };
  let validator: { validate: jest.Mock };
  let chatReplies: { persist: jest.Mock };
  let activity: { start: jest.Mock; succeed: jest.Mock; fail: jest.Mock };
  let processor: AiJobsProcessor;

  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation();
    jest.spyOn(Logger.prototype, 'error').mockImplementation();
    aiService = { request: jest.fn().mockResolvedValue({}) };
    sourceContext = {
      sourceContext: jest.fn().mockResolvedValue({
        organizationId,
        requesterUserId: 'user-1',
        conversationId,
        latestMessageId: sourceId,
        message: { content: 'Send project quotation' },
        pendingProposals: [],
        facts: { tasks: { availability: 'AVAILABLE', items: [] } },
      }),
      organizationContext: jest.fn().mockResolvedValue({
        organizationId,
        timezone: 'Asia/Dhaka',
      }),
      requesterContext: jest.fn().mockResolvedValue({
        userId: 'user-1',
        timezone: 'Asia/Dhaka',
      }),
      markMessageProcessed: jest.fn().mockResolvedValue(undefined),
    };
    actions = {
      ingestAnalysis: jest.fn().mockResolvedValue([{ id: 'proposal-1' }]),
    };
    validator = {
      validate: jest.fn().mockResolvedValue({
        actions: [
          {
            actionId: 'send-project-quotation',
            actionType: 'CREATE_TASK',
            payload: { title: 'Send project quotation' },
          },
        ],
        assistantMessage: {
          responseId: 'quotation-job:reply:v1',
          content: 'I prepared a task proposal to send the project quotation.',
          agent: { id: 'agent-1', name: 'Laura', type: 'CHIEF_OF_STAFF' },
        },
      }),
    };
    chatReplies = {
      persist: jest.fn().mockResolvedValue({
        created: true,
        message: { _id: 'assistant-message-1' },
      }),
    };
    activity = {
      start: jest.fn().mockResolvedValue('activity-1'),
      succeed: jest.fn().mockResolvedValue(undefined),
      fail: jest.fn().mockResolvedValue(undefined),
    };
    processor = new AiJobsProcessor(
      aiService as unknown as AiServiceClient,
      actions as unknown as AiActionsService,
      sourceContext as unknown as AiSourceContextService,
      { get: jest.fn().mockReturnValue(false) } as unknown as ConfigService,
      {} as AiActionClarificationWorkflowService,
      validator as unknown as AiAnalysisResponseValidator,
      chatReplies as unknown as AiChatReplyService,
      activity as unknown as AgentActivityService,
    );
  });

  afterEach(() => jest.restoreAllMocks());

  it('persists the quotation proposal and assistant reply separately', async () => {
    await expect(processor.process(job)).resolves.toEqual({
      proposals: [{ id: 'proposal-1' }],
      assistantMessageId: 'assistant-message-1',
      assistantMessageCreated: true,
    });
    expect(actions.ingestAnalysis).toHaveBeenCalledWith(
      organizationId,
      { type: 'USER_MESSAGE', id: sourceId },
      expect.objectContaining({ actions: expect.any(Array) }),
      expect.objectContaining({ conversationId }),
    );
    expect(chatReplies.persist).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId,
        conversationId,
        sourceMessageId: sourceId,
        assistantMessage: expect.objectContaining({
          responseId: 'quotation-job:reply:v1',
        }),
      }),
    );
    expect(sourceContext.markMessageProcessed).toHaveBeenNthCalledWith(
      1,
      organizationId,
      sourceId,
      'PROCESSING',
    );
    expect(sourceContext.markMessageProcessed).toHaveBeenLastCalledWith(
      organizationId,
      sourceId,
      'COMPLETED',
    );
  });

  it('keeps a user message processing while a retryable AI error will retry', async () => {
    aiService.request.mockRejectedValue(
      new AiServiceHttpError('unavailable', true),
    );

    await expect(processor.process(job)).rejects.toBeInstanceOf(
      AiServiceHttpError,
    );
    expect(sourceContext.markMessageProcessed).toHaveBeenCalledTimes(1);
    expect(sourceContext.markMessageProcessed).toHaveBeenCalledWith(
      organizationId,
      sourceId,
      'PROCESSING',
    );
  });

  it('marks a permanent AI error as failed without another queue attempt', async () => {
    aiService.request.mockRejectedValue(
      new AiServiceHttpError('bad request', false),
    );

    await expect(processor.process(job)).rejects.toBeInstanceOf(
      UnrecoverableError,
    );
    expect(sourceContext.markMessageProcessed).toHaveBeenLastCalledWith(
      organizationId,
      sourceId,
      'FAILED',
      'bad request',
    );
  });
});

describe('AiJobsProcessor clarification refinement', () => {
  const organizationId = 'org-1';
  const proposalId = 'proposal-1';
  const questionId = 'meeting-platform';
  const answer = 'Google Meet';
  let aiService: { request: jest.Mock };
  let actions: {
    get: jest.Mock;
    applyClarificationResult: jest.Mock;
  };
  let clarificationWorkflow: {
    recoverAfterFinalFailure: jest.Mock;
    recoverStaleRefinement: jest.Mock;
  };
  let processor: AiJobsProcessor;

  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation();
    aiService = {
      request: jest.fn().mockResolvedValue({
        action: {
          actionId: 'meeting-001',
          actionType: 'SCHEDULE_MEETING',
          payload: {},
          confidence: 0.9,
        },
      }),
    };
    actions = {
      get: jest.fn().mockResolvedValue({
        requestId: 'source-call_transcript-recording-1',
        status: 'ANALYZING',
        revision: 3,
        clarificationAnswers: { [questionId]: answer },
      }),
      applyClarificationResult: jest.fn().mockResolvedValue({
        status: 'NEEDS_CLARIFICATION',
      }),
    };
    clarificationWorkflow = {
      recoverAfterFinalFailure: jest.fn(),
      recoverStaleRefinement: jest.fn().mockResolvedValue({
        status: 'NEEDS_CLARIFICATION',
      }),
    };
    processor = new AiJobsProcessor(
      aiService as unknown as AiServiceClient,
      actions as unknown as AiActionsService,
      {} as AiSourceContextService,
      {} as ConfigService,
      clarificationWorkflow as unknown as AiActionClarificationWorkflowService,
      {} as AiAnalysisResponseValidator,
      {} as AiChatReplyService,
      {} as AgentActivityService,
    );
  });

  afterEach(() => jest.restoreAllMocks());

  it('refines only after the queued answer is persisted on the proposal', async () => {
    const refinementJob = {
      id: 'refinement-job',
      name: AI_REFINE_ACTION_JOB,
      attemptsMade: 0,
      opts: { attempts: 6 },
      data: {
        organizationId,
        proposalId,
        questionId,
        answer,
        revision: 3,
      },
    } as unknown as Job<RefineActionJob>;

    await processor.process(refinementJob);

    expect(aiService.request).toHaveBeenCalledWith(
      '/api/v1/ai/actions/refine',
      expect.objectContaining({
        clarification: { questionId, answer },
      }),
    );
    expect(actions.applyClarificationResult).toHaveBeenCalledWith(
      organizationId,
      proposalId,
      expect.any(Object),
    );
  });

  it('skips an old refinement job instead of restoring a newer answer', async () => {
    actions.get.mockResolvedValue({
      requestId: 'source-call_transcript-recording-1',
      status: 'ANALYZING',
      revision: 3,
      clarificationAnswers: { [questionId]: 'Zoom' },
    });
    const refinementJob = {
      id: 'old-refinement-job',
      name: AI_REFINE_ACTION_JOB,
      attemptsMade: 0,
      opts: { attempts: 6 },
      data: {
        organizationId,
        proposalId,
        questionId,
        answer,
        revision: 3,
      },
    } as unknown as Job<RefineActionJob>;

    await expect(processor.process(refinementJob)).resolves.toEqual({
      skipped: true,
      reason: 'clarification-refinement-superseded',
    });
    expect(aiService.request).not.toHaveBeenCalled();
    expect(clarificationWorkflow.recoverAfterFinalFailure).not.toHaveBeenCalled();
  });

  it('restores the exact stale ANALYZING attempt through the existing queue', async () => {
    const proposalUpdatedAt = '2026-10-10T05:59:54.014Z';
    const recoveryJob = {
      id: 'recovery-job',
      name: AI_RECOVER_ACTION_REFINEMENT_JOB,
      attemptsMade: 0,
      opts: { attempts: 6 },
      data: { organizationId, proposalId, proposalUpdatedAt },
    } as unknown as Job<RecoverActionRefinementJob>;

    await processor.process(recoveryJob);

    expect(clarificationWorkflow.recoverStaleRefinement).toHaveBeenCalledWith(
      organizationId,
      proposalId,
      proposalUpdatedAt,
    );
  });
});
