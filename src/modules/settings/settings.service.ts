import { BadRequestException, Injectable } from '@nestjs/common';
import { AiResponseStyle } from '../../common/enums/ai-response-style.enum';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { UpdateAiSettingsDto } from './dto/update-ai-settings.dto';
import { UpdateNotificationPreferencesDto } from './dto/update-notification-preferences.dto';
import { SettingsRepository } from './settings.repository';

const DEFAULT_NOTIFICATIONS = {
  emailNotifications: true,
  inAppNotifications: true,
  agentTaskCompletions: true,
  meetingReminders: true,
  weeklyRoiReports: true,
  productUpdates: true,
};

const DEFAULT_AI_SETTINGS = {
  autoApproveLowRiskActions: false,
  learningMode: true,
  agentActivityNotifications: true,
  responseStyle: AiResponseStyle.PROFESSIONAL,
};

@Injectable()
export class SettingsService {
  constructor(
    private readonly repository: SettingsRepository,
    private readonly auditLogs: AuditLogsService,
  ) {}

  async getNotifications(userId: string) {
    const preferences = await this.repository.findNotificationsByUser(userId);
    return this.notificationResponse(userId, preferences);
  }

  private notificationResponse(
    userId: string,
    preferences?: Record<string, unknown> | null,
  ) {
    return {
      userId,
      ...DEFAULT_NOTIFICATIONS,
      ...(preferences
        ? {
            emailNotifications: preferences.emailNotifications,
            inAppNotifications: preferences.inAppNotifications,
            agentTaskCompletions: preferences.agentTaskCompletions,
            meetingReminders: preferences.meetingReminders,
            weeklyRoiReports: preferences.weeklyRoiReports,
            productUpdates: preferences.productUpdates,
          }
        : {}),
    };
  }

  async updateNotifications(
    organizationId: string,
    userId: string,
    dto: UpdateNotificationPreferencesDto,
  ) {
    const update = this.definedFields(dto);
    if (Object.keys(update).length === 0) {
      throw new BadRequestException('No notification changes were provided');
    }

    const preferences = await this.repository.upsertNotifications(
      userId,
      update,
    );
    await this.auditLogs.create({
      organizationId,
      userId,
      action: 'NOTIFICATION_PREFERENCES_UPDATED',
      resourceType: 'NotificationPreference',
      resourceId: String(preferences?._id),
      metadata: { fields: Object.keys(update) },
    });
    return this.notificationResponse(userId, preferences);
  }

  async getAiSettings(organizationId: string) {
    const settings =
      await this.repository.findAiSettingsByOrganization(organizationId);
    return this.aiResponse(organizationId, settings);
  }

  private aiResponse(
    organizationId: string,
    settings?: Record<string, unknown> | null,
  ) {
    return {
      organizationId,
      ...DEFAULT_AI_SETTINGS,
      ...(settings
        ? {
            autoApproveLowRiskActions: settings.autoApproveLowRiskActions,
            learningMode: settings.learningMode,
            agentActivityNotifications: settings.agentActivityNotifications,
            responseStyle: settings.responseStyle,
          }
        : {}),
    };
  }

  async updateAiSettings(
    organizationId: string,
    userId: string,
    dto: UpdateAiSettingsDto,
  ) {
    const update = this.definedFields(dto);
    if (Object.keys(update).length === 0) {
      throw new BadRequestException('No AI setting changes were provided');
    }

    const settings = await this.repository.upsertAiSettings(organizationId, {
      ...update,
      updatedBy: userId,
    });
    await this.auditLogs.create({
      organizationId,
      userId,
      action: 'AI_SETTINGS_UPDATED',
      resourceType: 'AiSetting',
      resourceId: String(settings?._id),
      metadata: { fields: Object.keys(update) },
    });
    return this.aiResponse(organizationId, settings);
  }

  private definedFields(input: object) {
    return Object.fromEntries(
      Object.entries(input).filter(([, value]) => value !== undefined),
    ) as Record<string, unknown>;
  }
}
