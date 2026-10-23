import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import { AiServiceClient } from './ai-service.client';
import {
  AI_CHAT_TURN_JOB,
  AI_RECOVER_ACTION_REFINEMENT_JOB,
  AI_REFINE_ACTION_JOB,
  AiJobsQueue,
} from './ai-jobs.queue';

describe('AiJobsQueue clarification durability', () => {
  const queue = {
    add: jest.fn(),
  };
  const aiService = { enabled: true };
  let jobs: AiJobsQueue;

  beforeEach(() => {
    jest.resetAllMocks();
    queue.add.mockImplementation(async (_name, _data, options) => ({
      id: options.jobId,
      getState: jest.fn().mockResolvedValue('delayed'),
    }));
    jobs = new AiJobsQueue(
      queue as unknown as Queue,
      aiService as AiServiceClient,
      { get: jest.fn().mockReturnValue(1_500) } as unknown as ConfigService,
    );
  });

  it('queues each user message as a dedicated chat turn', async () => {
    const input = {
      organizationId: 'org-1',
      messageId: 'message-1',
    };

    await jobs.enqueueMessageAnalysis(input);

    expect(queue.add).toHaveBeenCalledWith(
      AI_CHAT_TURN_JOB,
      {
        organizationId: input.organizationId,
        sourceType: 'USER_MESSAGE',
        sourceId: input.messageId,
      },
      expect.objectContaining({ delay: 1_500, attempts: 6 }),
    );
  });

  it('keys a delayed refinement job by proposal revision', async () => {
    const input = {
      organizationId: 'org-1',
      proposalId: 'proposal-1',
      questionId: 'meeting-platform',
      answer: 'Google Meet',
      revision: 3,
    };

    await jobs.enqueueActionRefinement(input);
    await jobs.enqueueActionRefinement({
      ...input,
      revision: 4,
    });

    expect(queue.add).toHaveBeenNthCalledWith(
      1,
      AI_REFINE_ACTION_JOB,
      input,
      expect.objectContaining({ delay: 250, attempts: 6 }),
    );
    const firstOptions = queue.add.mock.calls[0][2] as { jobId: string };
    const secondOptions = queue.add.mock.calls[1][2] as { jobId: string };
    expect(firstOptions.jobId).not.toBe(secondOptions.jobId);
  });

  it('schedules stale ANALYZING recovery on the same queue', async () => {
    const input = {
      organizationId: 'org-1',
      proposalId: 'proposal-1',
      proposalUpdatedAt: '2026-10-10T05:59:54.014Z',
    };

    await jobs.enqueueActionRefinementRecovery(input);

    expect(queue.add).toHaveBeenCalledWith(
      AI_RECOVER_ACTION_REFINEMENT_JOB,
      input,
      expect.objectContaining({ delay: 600_000, attempts: 6 }),
    );
  });
});
