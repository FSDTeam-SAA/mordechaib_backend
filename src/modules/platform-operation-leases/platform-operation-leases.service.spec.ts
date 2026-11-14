import { ConflictException } from '@nestjs/common';
import { PlatformOperationLeasesRepository } from './platform-operation-leases.repository';
import { PlatformOperationLeasesService } from './platform-operation-leases.service';

describe('PlatformOperationLeasesService', () => {
  const repository = {
    acquire: jest.fn(),
    release: jest.fn(),
  };
  const service = new PlatformOperationLeasesService(
    repository as unknown as PlatformOperationLeasesRepository,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    repository.acquire.mockResolvedValue(true);
    repository.release.mockResolvedValue(undefined);
  });

  it('serializes operations using a stable resource key', async () => {
    const execute = jest.fn().mockResolvedValue('done');

    await expect(
      service.runExclusive({
        scope: 'organization-administration',
        resourceId: 'organization-1',
        operation: 'CHANGE_PLAN',
        actorUserId: 'admin-1',
        execute,
      }),
    ).resolves.toBe('done');

    expect(repository.acquire).toHaveBeenCalledWith(
      expect.objectContaining({
        key: 'organization-administration:organization-1',
        operation: 'CHANGE_PLAN',
        actorUserId: 'admin-1',
        token: expect.any(String),
        now: expect.any(Date),
        expiresAt: expect.any(Date),
      }),
    );
    const lease = repository.acquire.mock.calls[0][0];
    expect(lease.expiresAt.getTime() - lease.now.getTime()).toBe(5 * 60_000);
    expect(repository.release).toHaveBeenCalledWith(lease.key, lease.token);
  });

  it('rejects a conflicting operation without executing it', async () => {
    repository.acquire.mockResolvedValue(false);
    const execute = jest.fn();

    await expect(
      service.runExclusive({
        scope: 'organization-administration',
        resourceId: 'organization-1',
        operation: 'UPDATE_STATUS',
        actorUserId: 'admin-1',
        execute,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(execute).not.toHaveBeenCalled();
    expect(repository.release).not.toHaveBeenCalled();
  });

  it('releases the lease when the operation fails', async () => {
    const execute = jest.fn().mockRejectedValue(new Error('provider failed'));

    await expect(
      service.runExclusive({
        scope: 'organization-administration',
        resourceId: 'organization-1',
        operation: 'CHANGE_PLAN',
        actorUserId: 'admin-1',
        execute,
      }),
    ).rejects.toThrow('provider failed');
    expect(repository.release).toHaveBeenCalledTimes(1);
  });
});
