import { ConfigService } from '@nestjs/config';
import {
  ExecutiveBriefingStatus,
  ExecutiveBriefingType,
} from '../../common/enums/executive-briefing.enum';
import { UserRole } from '../../common/enums/user-role.enum';
import { ExecutiveBriefingFactsService } from './executive-briefing-facts.service';
import { ExecutiveBriefingsQueue } from './executive-briefings.queue';
import { ExecutiveBriefingsRepository } from './executive-briefings.repository';
import { ExecutiveBriefingsService } from './executive-briefings.service';

describe('ExecutiveBriefingsService', () => {
  const organizationId = '507f1f77bcf86cd799439011';
  const userId = '507f1f77bcf86cd799439012';
  let facts: Record<string, jest.Mock>;
  let repository: Record<string, jest.Mock>;
  let queue: Record<string, jest.Mock>;
  let service: ExecutiveBriefingsService;

  beforeEach(() => {
    facts = {
      prepare: jest.fn().mockResolvedValue({
        requesterScopeHash: 'scope-hash',
        inputHash: 'input-hash',
        input: {
          schemaVersion: '1.0',
          jobId: 'job-1',
          idempotencyKey: 'key-1',
          period: {
            start: '2026-09-17T18:00:00.000Z',
            end: '2026-09-18T18:00:00.000Z',
            timezone: 'Asia/Dhaka',
          },
        },
      }),
      scopeHash: jest.fn().mockReturnValue('scope-hash'),
    };
    repository = {
      reserve: jest.fn(),
      requeueFailed: jest.fn(),
      markFailed: jest.fn(),
      findLatestForPeriod: jest.fn(),
      findByIdForRequester: jest.fn(),
    };
    queue = { enqueue: jest.fn().mockResolvedValue({ queued: true }) };
    service = new ExecutiveBriefingsService(
      facts as unknown as ExecutiveBriefingFactsService,
      repository as unknown as ExecutiveBriefingsRepository,
      queue as unknown as ExecutiveBriefingsQueue,
      {
        get: jest.fn((_key: string, fallback: number) => fallback),
      } as unknown as ConfigService,
    );
  });

  it('reserves and queues a new briefing', async () => {
    repository.reserve.mockResolvedValue({
      created: true,
      record: { _id: '507f1f77bcf86cd799439013', status: 'QUEUED' },
    });

    await expect(
      service.generate(organizationId, userId, ExecutiveBriefingType.TODAY, {}),
    ).resolves.toEqual(
      expect.objectContaining({
        briefingId: '507f1f77bcf86cd799439013',
        status: ExecutiveBriefingStatus.QUEUED,
        duplicate: false,
      }),
    );
    expect(queue.enqueue).toHaveBeenCalledWith(
      {
        organizationId,
        briefingId: '507f1f77bcf86cd799439013',
      },
      'key-1',
    );
  });

  it('reuses a ready briefing without queuing another job', async () => {
    repository.reserve.mockResolvedValue({
      created: false,
      record: {
        _id: '507f1f77bcf86cd799439013',
        status: ExecutiveBriefingStatus.READY,
      },
    });

    const result = await service.generate(
      organizationId,
      userId,
      ExecutiveBriefingType.TODAY,
      {},
    );

    expect(result.status).toBe(ExecutiveBriefingStatus.READY);
    expect(result.duplicate).toBe(true);
    expect(queue.enqueue).not.toHaveBeenCalled();
  });

  it('uses the current requester scope when reading by id', async () => {
    repository.findByIdForRequester.mockResolvedValue({
      _id: '507f1f77bcf86cd799439013',
      status: ExecutiveBriefingStatus.QUEUED,
    });

    await service.getById(
      organizationId,
      userId,
      UserRole.OWNER,
      '507f1f77bcf86cd799439013',
    );

    expect(repository.findByIdForRequester).toHaveBeenCalledWith(
      organizationId,
      userId,
      'scope-hash',
      '507f1f77bcf86cd799439013',
    );
  });
});
