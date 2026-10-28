import {
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UserRole } from '../../common/enums/user-role.enum';
import { RequestUser } from '../../common/types/request-context.type';
import { PlatformServiceKey } from '../../database/schemas/platform-service-control.schema';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { SystemServicesRepository } from './system-services.repository';
import { SystemServicesService } from './system-services.service';

describe('SystemServicesService', () => {
  const actor: RequestUser = {
    id: 'platform-admin-1',
    email: 'admin@example.com',
    firstName: 'Platform',
    lastName: 'Admin',
    organizationId: 'platform-organization-1',
    role: UserRole.OWNER,
    sessionId: 'session-1',
    isPlatformAdmin: true,
  };
  const repository = {
    find: jest.fn(),
    update: jest.fn(),
  };
  const config = { get: jest.fn() };
  const auditLogs = { create: jest.fn() };
  let service: SystemServicesService;

  beforeEach(() => {
    jest.resetAllMocks();
    config.get.mockImplementation((_key: string, fallback: unknown) =>
      _key === 'aiService.automationEnabled' ? true : fallback,
    );
    repository.find.mockResolvedValue(null);
    repository.update.mockImplementation(async (key, input) => ({
      _id: 'control-1',
      service: key,
      ...input,
    }));
    auditLogs.create.mockResolvedValue(undefined);
    service = new SystemServicesService(
      repository as unknown as SystemServicesRepository,
      config as unknown as ConfigService,
      auditLogs as unknown as AuditLogsService,
    );
  });

  it('defaults to enabled when automation is configured and no override exists', async () => {
    await expect(service.isAiServiceEnabled()).resolves.toBe(true);
    await expect(service.getAiServiceControl()).resolves.toEqual(
      expect.objectContaining({
        service: PlatformServiceKey.AI_BACKEND,
        enabled: true,
        runtimeEnabled: true,
        configurationEnabled: true,
      }),
    );
  });

  it('requires an operational reason when disabling AI', async () => {
    await expect(
      service.updateAiServiceControl(actor, { enabled: false }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(repository.update).not.toHaveBeenCalled();
  });

  it('persists and audits a platform-wide disable operation', async () => {
    const result = await service.updateAiServiceControl(actor, {
      enabled: false,
      reason: 'AI provider incident',
    });

    expect(repository.update).toHaveBeenCalledWith(
      PlatformServiceKey.AI_BACKEND,
      expect.objectContaining({
        enabled: false,
        reason: 'AI provider incident',
        changedByUserId: actor.id,
      }),
    );
    expect(auditLogs.create).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'PLATFORM_AI_SERVICE_DISABLED',
        userId: actor.id,
      }),
    );
    expect(result).toEqual(expect.objectContaining({ enabled: false }));
  });

  it('blocks AI calls when the durable runtime switch is disabled', async () => {
    repository.find.mockResolvedValue({ enabled: false });

    await expect(service.assertAiServiceEnabled()).rejects.toMatchObject({
      status: 503,
    });
    await expect(service.assertAiServiceEnabled()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('cannot override an environment-level automation shutdown', async () => {
    config.get.mockImplementation((_key: string, fallback: unknown) =>
      _key === 'aiService.automationEnabled' ? false : fallback,
    );
    repository.find.mockResolvedValue({ enabled: true });

    await expect(service.isAiServiceEnabled()).resolves.toBe(false);
    await expect(service.getAiServiceControl()).resolves.toEqual(
      expect.objectContaining({
        enabled: false,
        runtimeEnabled: true,
        configurationEnabled: false,
      }),
    );
  });
});
