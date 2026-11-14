import { ConflictException } from '@nestjs/common';
import { AdminMeetingOperationLeaseRepository } from './admin-meeting-operation-lease.repository';
import { AdminMeetingOperationLeaseService } from './admin-meeting-operation-lease.service';

describe('AdminMeetingOperationLeaseService', () => {
  let repository: Record<string, jest.Mock>;
  let service: AdminMeetingOperationLeaseService;

  beforeEach(() => {
    repository = {
      acquire: jest.fn().mockResolvedValue(true),
      release: jest.fn().mockResolvedValue(undefined),
    };
    service = new AdminMeetingOperationLeaseService(
      repository as unknown as AdminMeetingOperationLeaseRepository,
    );
  });

  it('executes once while holding a durable bounded lease', async () => {
    const execute = jest.fn().mockResolvedValue('done');

    await expect(
      service.run({
        key: 'calendar-item:PLATFORM_MEETING:meeting-1',
        operation: 'CANCEL',
        actorUserId: 'admin-1',
        execute,
      }),
    ).resolves.toBe('done');

    expect(repository.acquire).toHaveBeenCalledWith(
      expect.objectContaining({
        key: 'calendar-item:PLATFORM_MEETING:meeting-1',
        operation: 'CANCEL',
        actorUserId: 'admin-1',
        token: expect.any(String),
        now: expect.any(Date),
        expiresAt: expect.any(Date),
      }),
    );
    const acquireInput = repository.acquire.mock.calls[0][0];
    expect(acquireInput.expiresAt.getTime() - acquireInput.now.getTime()).toBe(
      300_000,
    );
    expect(repository.release).toHaveBeenCalledWith(
      acquireInput.key,
      acquireInput.token,
    );
  });

  it('rejects a concurrent operation before executing provider work', async () => {
    repository.acquire.mockResolvedValue(false);
    const execute = jest.fn();

    await expect(
      service.run({
        key: 'calendar-sync:org-1',
        operation: 'SYNC',
        actorUserId: 'admin-1',
        execute,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(execute).not.toHaveBeenCalled();
    expect(repository.release).not.toHaveBeenCalled();
  });

  it('releases the lease when provider work fails', async () => {
    const execute = jest.fn().mockRejectedValue(new Error('Provider failed'));

    await expect(
      service.run({
        key: 'calendar-sync:org-1',
        operation: 'SYNC',
        actorUserId: 'admin-1',
        execute,
      }),
    ).rejects.toThrow('Provider failed');
    expect(repository.release).toHaveBeenCalledTimes(1);
  });

  it('does not hide a successful operation when best-effort release fails', async () => {
    repository.release.mockRejectedValue(new Error('Mongo unavailable'));

    await expect(
      service.run({
        key: 'calendar-sync:org-1',
        operation: 'SYNC',
        actorUserId: 'admin-1',
        execute: async () => 'done',
      }),
    ).resolves.toBe('done');
  });
});
