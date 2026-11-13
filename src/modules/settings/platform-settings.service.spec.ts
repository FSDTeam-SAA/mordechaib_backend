import { BadRequestException, ConflictException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UserRole } from '../../common/enums/user-role.enum';
import { RequestUser } from '../../common/types/request-context.type';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { OrganizationLogoStorageService } from '../organizations/organization-logo-storage.service';
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
  const brandingStorage = {
    uploadPlatformLogo: jest.fn(),
    uploadPlatformFavicon: jest.fn(),
  };
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
    brandingStorage.uploadPlatformLogo.mockResolvedValue(
      'https://cdn.noltra.ai/platform-logo.png',
    );
    brandingStorage.uploadPlatformFavicon.mockResolvedValue(
      'https://cdn.noltra.ai/platform-favicon.png',
    );
    service = new PlatformSettingsService(
      repository as unknown as PlatformSettingsRepository,
      config as unknown as ConfigService,
      audits as unknown as AuditLogsService,
      brandingStorage as unknown as OrganizationLogoStorageService,
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
      maintenanceMode: false,
      logoUrl: null,
      faviconUrl: null,
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

  it('uploads platform branding and persists only generated URLs', async () => {
    const logo = { buffer: Buffer.from('logo') } as Express.Multer.File;
    const favicon = {
      buffer: Buffer.from('favicon'),
    } as Express.Multer.File;

    const result = await service.updateBranding(
      actor,
      { expectedRevision: 0 },
      { logo, favicon },
    );

    expect(brandingStorage.uploadPlatformLogo).toHaveBeenCalledWith(logo);
    expect(brandingStorage.uploadPlatformFavicon).toHaveBeenCalledWith(favicon);
    expect(repository.update).toHaveBeenCalledWith(
      0,
      {
        logoUrl: 'https://cdn.noltra.ai/platform-logo.png',
        faviconUrl: 'https://cdn.noltra.ai/platform-favicon.png',
      },
      actor.id,
    );
    expect(audits.create).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'PLATFORM_BRANDING_UPDATED' }),
    );
    expect(result).toEqual(
      expect.objectContaining({
        logoUrl: 'https://cdn.noltra.ai/platform-logo.png',
        faviconUrl: 'https://cdn.noltra.ai/platform-favicon.png',
      }),
    );
  });

  it('rejects a branding update without an asset', async () => {
    await expect(
      service.updateBranding(actor, { expectedRevision: 0 }, {}),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(repository.update).not.toHaveBeenCalled();
  });

  it('caches maintenance state for the guard hot path', async () => {
    repository.find.mockResolvedValue({ maintenanceMode: true });

    await expect(service.isMaintenanceModeEnabled()).resolves.toBe(true);
    await expect(service.isMaintenanceModeEnabled()).resolves.toBe(true);
    expect(repository.find).toHaveBeenCalledTimes(1);
  });
});
