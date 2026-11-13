import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { assertValidTimezone } from '../../common/helpers/timezone.helper';
import { RequestUser } from '../../common/types/request-context.type';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { UpdatePlatformSettingsDto } from './dto/update-platform-settings.dto';
import { PlatformSettingsRepository } from './platform-settings.repository';

const MUTABLE_FIELDS = [
  'platformName',
  'platformUrl',
  'supportEmail',
  'supportPhone',
  'timezone',
  'language',
  'defaultCurrency',
  'dateFormat',
  'timeFormat',
] as const;

@Injectable()
export class PlatformSettingsService {
  constructor(
    private readonly repository: PlatformSettingsRepository,
    private readonly config: ConfigService,
    private readonly auditLogs: AuditLogsService,
  ) {}

  async get() {
    const stored = await this.repository.find();
    return this.response(stored);
  }

  async update(actor: RequestUser, input: UpdatePlatformSettingsDto) {
    const changes = Object.fromEntries(
      MUTABLE_FIELDS.flatMap((field) =>
        input[field] !== undefined ? [[field, input[field]]] : [],
      ),
    );
    if (!Object.keys(changes).length) {
      throw new BadRequestException(
        'No platform setting changes were provided',
      );
    }
    if (typeof changes.timezone === 'string') {
      assertValidTimezone(changes.timezone);
    }
    if (typeof changes.defaultCurrency === 'string') {
      changes.defaultCurrency = changes.defaultCurrency.toUpperCase();
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
      action: 'PLATFORM_SETTINGS_UPDATED',
      resourceType: 'PlatformSetting',
      resourceId: 'GLOBAL',
      metadata: {
        fields: Object.keys(changes),
        revision: updated.revision,
      },
    });
    return this.response(updated);
  }

  private response(stored?: Record<string, unknown> | null) {
    return {
      platformName: this.string(stored?.platformName, 'Noltra AI'),
      platformUrl: this.string(
        stored?.platformUrl,
        this.config.get<string>('mail.frontendUrl', 'http://localhost:3000'),
      ),
      supportEmail: this.nullableString(
        stored?.supportEmail,
        this.config.get<string>('mail.supportEmail'),
      ),
      supportPhone: this.nullableString(stored?.supportPhone),
      timezone: this.string(stored?.timezone, 'UTC'),
      language: this.string(stored?.language, 'en'),
      defaultCurrency: this.string(stored?.defaultCurrency, 'USD'),
      dateFormat: this.string(stored?.dateFormat, 'MM/DD/YYYY'),
      timeFormat: this.string(stored?.timeFormat, '12H'),
      revision: typeof stored?.revision === 'number' ? stored.revision : 0,
      updatedByUserId: this.nullableString(stored?.updatedByUserId),
      updatedAt:
        stored?.updatedAt instanceof Date
          ? stored.updatedAt.toISOString()
          : stored?.updatedAt || null,
    };
  }

  private string(value: unknown, fallback: string) {
    return typeof value === 'string' && value ? value : fallback;
  }

  private nullableString(value: unknown, fallback?: string) {
    if (value === null) return null;
    return typeof value === 'string' && value ? value : fallback || null;
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
      'Platform settings were updated elsewhere. Refresh and try again.',
    );
  }
}
