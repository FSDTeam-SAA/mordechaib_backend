import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RequestUser } from '../../common/types/request-context.type';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { UpdatePlatformNotificationSettingsDto } from './dto/update-platform-notification-settings.dto';
import { PlatformNotificationSettingsRepository } from './platform-notification-settings.repository';

const MUTABLE_FIELDS = [
  'newOrganizationRegistered',
  'subscriptionPaymentReceived',
  'failedPayment',
  'userReportedIssue',
  'agentErrorDetected',
  'systemHealthAlert',
  'emailRecipients',
] as const;

export type PlatformNotificationEvent = Exclude<
  (typeof MUTABLE_FIELDS)[number],
  'emailRecipients'
>;

@Injectable()
export class PlatformNotificationSettingsService {
  constructor(
    private readonly repository: PlatformNotificationSettingsRepository,
    private readonly config: ConfigService,
    private readonly auditLogs: AuditLogsService,
  ) {}

  async get() {
    return this.response(await this.repository.find());
  }

  async update(
    actor: RequestUser,
    input: UpdatePlatformNotificationSettingsDto,
  ) {
    const changes = Object.fromEntries(
      MUTABLE_FIELDS.flatMap((field) =>
        input[field] !== undefined ? [[field, input[field]]] : [],
      ),
    );
    if (!Object.keys(changes).length) {
      throw new BadRequestException(
        'No platform notification changes were provided',
      );
    }

    let updated: Record<string, unknown> | null;
    try {
      updated = (await this.repository.update(
        input.expectedRevision,
        changes,
        actor.id,
      )) as Record<string, unknown> | null;
    } catch (error) {
      if (!this.isDuplicateKey(error)) throw error;
      throw this.revisionConflict();
    }
    if (!updated) throw this.revisionConflict();

    await this.auditLogs.create({
      organizationId: actor.organizationId,
      userId: actor.id,
      action: 'PLATFORM_NOTIFICATION_SETTINGS_UPDATED',
      resourceType: 'PlatformNotificationSetting',
      resourceId: 'GLOBAL',
      metadata: {
        fields: Object.keys(changes),
        revision: updated.revision,
        recipientCount: Array.isArray(updated.emailRecipients)
          ? updated.emailRecipients.length
          : 0,
      },
    });
    return this.response(updated);
  }

  async deliveryPolicy(event: PlatformNotificationEvent) {
    const settings = await this.get();
    return {
      enabled: settings[event],
      recipients: settings.emailRecipients,
    };
  }

  private response(stored?: Record<string, unknown> | null) {
    return {
      newOrganizationRegistered: this.boolean(
        stored?.newOrganizationRegistered,
        true,
      ),
      subscriptionPaymentReceived: this.boolean(
        stored?.subscriptionPaymentReceived,
        true,
      ),
      failedPayment: this.boolean(stored?.failedPayment, true),
      userReportedIssue: this.boolean(stored?.userReportedIssue, true),
      agentErrorDetected: this.boolean(stored?.agentErrorDetected, true),
      systemHealthAlert: this.boolean(stored?.systemHealthAlert, true),
      emailRecipients: this.recipients(stored?.emailRecipients),
      revision: typeof stored?.revision === 'number' ? stored.revision : 0,
      updatedByUserId: this.nullableString(stored?.updatedByUserId),
      updatedAt:
        stored?.updatedAt instanceof Date
          ? stored.updatedAt.toISOString()
          : stored?.updatedAt || null,
    };
  }

  private recipients(value: unknown) {
    if (Array.isArray(value)) {
      return value.filter(
        (email): email is string => typeof email === 'string' && Boolean(email),
      );
    }
    const fallback = this.config.get<string>('mail.supportEmail');
    return fallback ? [fallback.trim().toLowerCase()] : [];
  }

  private boolean(value: unknown, fallback: boolean) {
    return typeof value === 'boolean' ? value : fallback;
  }

  private nullableString(value: unknown) {
    return typeof value === 'string' && value ? value : null;
  }

  private isDuplicateKey(error: unknown) {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 11000
    );
  }

  private revisionConflict() {
    return new ConflictException(
      'Platform notification settings were updated elsewhere. Refresh and try again.',
    );
  }
}
