import { BadRequestException, ConflictException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UserRole } from '../../common/enums/user-role.enum';
import { RequestUser } from '../../common/types/request-context.type';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { PlatformNotificationSettingsRepository } from './platform-notification-settings.repository';
import { PlatformNotificationSettingsService } from './platform-notification-settings.service';

describe('PlatformNotificationSettingsService', () => {
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
  let service: PlatformNotificationSettingsService;

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
    config.get.mockImplementation((key: string) =>
      key === 'mail.supportEmail' ? 'support@noltra.ai' : undefined,
    );
    audits.create.mockResolvedValue(undefined);
    service = new PlatformNotificationSettingsService(
      repository as unknown as PlatformNotificationSettingsRepository,
      config as unknown as ConfigService,
      audits as unknown as AuditLogsService,
    );
  });

  it('returns enabled defaults and the configured support recipient', async () => {
    await expect(service.get()).resolves.toEqual({
      newOrganizationRegistered: true,
      subscriptionPaymentReceived: true,
      failedPayment: true,
      userReportedIssue: true,
      agentErrorDetected: true,
      systemHealthAlert: true,
      emailRecipients: ['support@noltra.ai'],
      revision: 0,
      updatedByUserId: null,
      updatedAt: null,
    });
  });

  it('updates only supplied fields with optimistic concurrency and audit', async () => {
    const result = await service.update(actor, {
      expectedRevision: 0,
      failedPayment: false,
      emailRecipients: ['admin@noltra.ai', 'ops@noltra.ai'],
    });

    expect(repository.update).toHaveBeenCalledWith(
      0,
      {
        failedPayment: false,
        emailRecipients: ['admin@noltra.ai', 'ops@noltra.ai'],
      },
      actor.id,
    );
    expect(audits.create).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'PLATFORM_NOTIFICATION_SETTINGS_UPDATED',
        metadata: {
          fields: ['failedPayment', 'emailRecipients'],
          revision: 1,
          recipientCount: 2,
        },
      }),
    );
    expect(result).toEqual(
      expect.objectContaining({
        failedPayment: false,
        emailRecipients: ['admin@noltra.ai', 'ops@noltra.ai'],
        revision: 1,
      }),
    );
  });

  it('provides a reusable event delivery policy', async () => {
    repository.find.mockResolvedValue({
      userReportedIssue: false,
      emailRecipients: ['ops@noltra.ai'],
      revision: 3,
    });

    await expect(service.deliveryPolicy('userReportedIssue')).resolves.toEqual({
      enabled: false,
      recipients: ['ops@noltra.ai'],
    });
  });

  it('rejects empty and stale updates', async () => {
    await expect(
      service.update(actor, { expectedRevision: 0 }),
    ).rejects.toBeInstanceOf(BadRequestException);

    repository.update.mockResolvedValue(null);
    await expect(
      service.update(actor, { expectedRevision: 4, failedPayment: false }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
