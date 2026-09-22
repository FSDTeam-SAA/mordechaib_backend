import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job, UnrecoverableError } from 'bullmq';
import { AiServiceClient } from '../ai-integration/ai-service.client';
import { ExecutiveBriefingResponseValidator } from './executive-briefing-response.validator';
import { ExecutiveBriefingsProcessor } from './executive-briefings.processor';
import {
  GENERATE_EXECUTIVE_BRIEFING_JOB,
  GenerateExecutiveBriefingJob,
} from './executive-briefings.queue';
import { ExecutiveBriefingsRepository } from './executive-briefings.repository';
import { AgentActivityService } from '../ai-telemetry/agent-activity.service';

describe('ExecutiveBriefingsProcessor', () => {
  const organizationId = 'org-1';
  const briefingId = 'briefing-1';
  const input = {
    jobId: 'job-1',
    agents: [],
    briefingType: 'TODAY',
    period: {
      start: '2026-09-17T18:00:00.000Z',
      end: '2026-09-18T18:00:00.000Z',
      timezone: 'Asia/Dhaka',
    },
  };
  let repository: Record<string, jest.Mock>;
  let aiService: Record<string, jest.Mock>;
  let validator: Record<string, jest.Mock>;
  let activity: Record<string, jest.Mock>;
  let processor: ExecutiveBriefingsProcessor;

  beforeEach(() => {
    repository = {
      claimForGeneration: jest.fn().mockResolvedValue({ input }),
      findForWorker: jest.fn(),
      markReady: jest.fn().mockResolvedValue({ _id: briefingId }),
      markFailed: jest.fn().mockResolvedValue({ _id: briefingId }),
    };
    aiService = { request: jest.fn().mockResolvedValue({ response: true }) };
    validator = {
      validate: jest.fn().mockReturnValue({ sourceRefs: [], confidence: 0.9 }),
    };
    activity = {
      start: jest.fn().mockResolvedValue('activity-1'),
      succeed: jest.fn().mockResolvedValue(undefined),
      fail: jest.fn().mockResolvedValue(undefined),
    };
    processor = new ExecutiveBriefingsProcessor(
      repository as unknown as ExecutiveBriefingsRepository,
      aiService as unknown as AiServiceClient,
      validator as unknown as ExecutiveBriefingResponseValidator,
      {
        get: jest.fn((_key: string, fallback: number) => fallback),
      } as unknown as ConfigService,
      activity as unknown as AgentActivityService,
    );
  });

  it('calls the canonical AI route and stores a validated response', async () => {
    await expect(processor.process(job())).resolves.toEqual({
      briefingId,
      status: 'READY',
    });
    expect(aiService.request).toHaveBeenCalledWith(
      '/api/v1/ai/briefings/generate',
      input,
      { timeoutMs: 60_000 },
    );
    expect(repository.markReady).toHaveBeenCalledWith(
      organizationId,
      briefingId,
      { sourceRefs: [], confidence: 0.9 },
    );
    expect(activity.succeed).toHaveBeenCalledWith(
      'activity-1',
      expect.objectContaining({ metadata: { briefingType: 'TODAY' } }),
    );
  });

  it('stores invalid AI output as a terminal failure', async () => {
    validator.validate.mockImplementation(() => {
      throw new BadRequestException('invalid response');
    });

    await expect(processor.process(job())).rejects.toBeInstanceOf(
      UnrecoverableError,
    );
    expect(repository.markFailed).toHaveBeenCalledWith(
      organizationId,
      briefingId,
      expect.objectContaining({
        code: 'INVALID_AI_RESPONSE',
        retryable: false,
      }),
    );
    expect(activity.fail).toHaveBeenCalledWith(
      'activity-1',
      expect.objectContaining({ failureCode: 'INVALID_AI_RESPONSE' }),
    );
  });

  function job() {
    return {
      name: GENERATE_EXECUTIVE_BRIEFING_JOB,
      data: { organizationId, briefingId },
      id: 'queue-job-1',
      attemptsMade: 0,
    } as Job<GenerateExecutiveBriefingJob>;
  }
});
