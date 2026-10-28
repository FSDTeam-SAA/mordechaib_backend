import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  PlatformServiceKey,
  PlatformServiceControl,
} from '../../database/schemas/platform-service-control.schema';
import { RequestUser } from '../../common/types/request-context.type';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { UpdateAiServiceControlDto } from './dto/update-ai-service-control.dto';
import { SystemServicesRepository } from './system-services.repository';

const AI_DISABLED_CODE = 'AI_SERVICE_TEMPORARILY_UNAVAILABLE';

@Injectable()
export class SystemServicesService {
  constructor(
    private readonly repository: SystemServicesRepository,
    private readonly config: ConfigService,
    private readonly auditLogs: AuditLogsService,
  ) {}

  async getAiServiceControl() {
    const stored = await this.repository.find(PlatformServiceKey.AI_BACKEND);
    return this.aiResponse(stored);
  }

  async isAiServiceEnabled() {
    if (!this.configurationEnabled) return false;
    const stored = await this.repository.find(PlatformServiceKey.AI_BACKEND);
    return stored?.enabled !== false;
  }

  async assertAiServiceEnabled() {
    if (await this.isAiServiceEnabled()) return;
    throw new ServiceUnavailableException({
      code: AI_DISABLED_CODE,
      message:
        'AI features are temporarily unavailable. Please try again later.',
    });
  }

  async updateAiServiceControl(
    actor: RequestUser,
    input: UpdateAiServiceControlDto,
  ) {
    const reason = input.reason?.trim();
    if (!input.enabled && !reason) {
      throw new BadRequestException(
        'A reason is required when disabling the AI service',
      );
    }
    const changedAt = new Date();
    const updated = await this.repository.update(
      PlatformServiceKey.AI_BACKEND,
      {
        enabled: input.enabled,
        ...(reason ? { reason } : {}),
        changedByUserId: actor.id,
        changedAt,
      },
    );
    await this.auditLogs.create({
      organizationId: actor.organizationId,
      userId: actor.id,
      action: input.enabled
        ? 'PLATFORM_AI_SERVICE_ENABLED'
        : 'PLATFORM_AI_SERVICE_DISABLED',
      resourceType: 'PlatformServiceControl',
      resourceId: String(updated?._id),
      metadata: {
        service: PlatformServiceKey.AI_BACKEND,
        enabled: input.enabled,
        ...(reason ? { reason } : {}),
      },
    });
    return this.aiResponse(updated);
  }

  private aiResponse(
    stored?:
      | (PlatformServiceControl & {
          _id?: unknown;
          updatedAt?: Date;
        })
      | null,
  ) {
    const runtimeEnabled = stored?.enabled !== false;
    return {
      service: PlatformServiceKey.AI_BACKEND,
      enabled: this.configurationEnabled && runtimeEnabled,
      runtimeEnabled,
      configurationEnabled: this.configurationEnabled,
      reason: stored?.reason,
      changedByUserId: stored?.changedByUserId,
      changedAt: stored?.changedAt,
      updatedAt: stored?.updatedAt,
    };
  }

  private get configurationEnabled() {
    return this.config.get<boolean>('aiService.automationEnabled', false);
  }
}
