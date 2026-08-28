import { ConfigService } from '@nestjs/config';
import { UnauthorizedException } from '@nestjs/common';
import { MeetingPlatform } from '../../common/enums/meeting-platform.enum';
import { MeetingOAuthStateRepository } from './meeting-oauth-state.repository';
import { MeetingOAuthStateService } from './meeting-oauth-state.service';

describe('MeetingOAuthStateService', () => {
  const repository = {
    create: jest.fn(),
    consume: jest.fn(),
  };
  const config = {
    getOrThrow: jest.fn().mockReturnValue('s'.repeat(32)),
    get: jest
      .fn()
      .mockReturnValue('https://app.example/dashboard/integrations'),
  };
  const service = new MeetingOAuthStateService(
    repository as unknown as MeetingOAuthStateRepository,
    config as unknown as ConfigService,
  );

  beforeEach(() => jest.clearAllMocks());

  it('persists a nonce and consumes a valid state once', async () => {
    repository.create.mockResolvedValue({});
    repository.consume.mockResolvedValue({ consumedAt: new Date() });

    const state = await service.create(
      MeetingPlatform.GOOGLE_MEET,
      'org-1',
      'user-1',
    );
    const context = await service.consume(state, MeetingPlatform.GOOGLE_MEET);

    expect(context).toEqual(
      expect.objectContaining({
        platform: MeetingPlatform.GOOGLE_MEET,
        organizationId: 'org-1',
        userId: 'user-1',
      }),
    );
    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'org-1',
        userId: 'user-1',
      }),
    );
    expect(repository.consume).toHaveBeenCalledTimes(1);
  });

  it('rejects a replayed state', async () => {
    repository.create.mockResolvedValue({});
    repository.consume.mockResolvedValueOnce(null);
    const state = await service.create(MeetingPlatform.ZOOM, 'org-1', 'user-1');

    await expect(
      service.consume(state, MeetingPlatform.ZOOM),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects a state signed for another platform', async () => {
    repository.create.mockResolvedValue({});
    const state = await service.create(MeetingPlatform.ZOOM, 'org-1', 'user-1');

    await expect(
      service.consume(state, MeetingPlatform.GOOGLE_MEET),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(repository.consume).not.toHaveBeenCalled();
  });
});
