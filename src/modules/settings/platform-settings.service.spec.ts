import { BadRequestException, ConflictException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UserRole } from '../../common/enums/user-role.enum';
import { RequestUser } from '../../common/types/request-context.type';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { PlatformSettingsRepository } from './platform-settings.repository';
import { PlatformSettingsService } from './platform-settings.service';

describe('PlatformSettingsService', () => {
  const actor: RequestUser = {
    id: 'admin-1',
    email: 'admin@noltra.ai',
    firstName: 'Platform',
    lastName: 'Admin',
    organizationId: 'platform-org-1',
    role: UserRole.OWNER,
    sessionId: 'session-1',
    isPlatformAdmin: true,
  };
  const repository = { find: jest.fn(), update: jest.fn() };
  const config = { get: jest.fn() };
  const audits = { create: jest.fn() };
  let service: PlatformSettingsService;

  beforeEach(() => {
    jest.resetAllMocks();
    repository.find.mockResolvedValue(null);
    repository.update.mockImplementation(
      async (_revision, changes, userId) => ({
        ...changes,
        revision: 1,
        updatedByUserId: userId,
        updatedAt: new Date('2026-11-13T06:00:00.000Z'),
      }),
    );
    config.get.mockImplementation((key: string, fallback?: unknown) => {
      if (key === 'mail.frontendUrl') return 'https://app.noltra.ai';
      if (key === 'mail.supportEmail') return 'support@noltra.ai';
      return fallback;
    });
    audits.create.mockResolvedValue(undefined);
    service = new PlatformSettingsService(
      repository as unknown as PlatformSettingsRepository,
      config as unknown as ConfigService,
      audits as unknown as AuditLogsService,
    );
  });

  it('returns safe defaults without creating a database record', async () => {
    await expect(service.get()).resolves.toEqual({
      platformName: 'Noltra AI',
      platformUrl: 'https://app.noltra.ai',
      supportEmail: 'support@noltra.ai',
      supportPhone: null,
      timezone: 'UTC',
      language: 'en',
      defaultCurrency: 'USD',
      dateFormat: 'MM/DD/YYYY',
      timeFormat: '12H',
      revision: 0,
      updatedByUserId: null,
      updatedAt: null,
    });
    expect(repository.update).not.toHaveBeenCalled();
  });

  it('persists validated changes and writes a bounded audit event', async () => {
    const result = await service.update(actor, {
      expectedRevision: 0,
      platformName: 'Noltra Platform',
      timezone: 'Asia/Dhaka',
      defaultCurrency: 'bdt',
    });

    expect(repository.update).toHaveBeenCalledWith(
      0,
      {
        platformName: 'Noltra Platform',
        timezone: 'Asia/Dhaka',
        defaultCurrency: 'BDT',
      },
      actor.id,
    );
    expect(audits.create).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'PLATFORM_SETTINGS_UPDATED',
        metadata: {
          fields: ['platformName', 'timezone', 'defaultCurrency'],
          revision: 1,
        },
      }),
    );
    expect(result).toEqual(expect.objectContaining({ revision: 1 }));
  });

  it('rejects empty updates', async () => {
    await expect(
      service.update(actor, { expectedRevision: 0 }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('returns a conflict for stale revisions', async () => {
    repository.update.mockResolvedValue(null);
    await expect(
      service.update(actor, { expectedRevision: 3, platformName: 'Changed' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
