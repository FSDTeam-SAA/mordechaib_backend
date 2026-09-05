import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AiSetting } from '../../database/schemas/ai-setting.schema';
import { NotificationPreference } from '../../database/schemas/notification-preference.schema';

@Injectable()
export class SettingsRepository {
  constructor(
    @InjectModel(NotificationPreference.name)
    private readonly notificationModel: Model<NotificationPreference>,
    @InjectModel(AiSetting.name)
    private readonly aiSettingModel: Model<AiSetting>,
  ) {}

  findNotificationsByUser(userId: string) {
    return this.notificationModel.findOne({ userId }).lean().exec();
  }

  upsertNotifications(userId: string, update: Record<string, unknown>) {
    return this.notificationModel
      .findOneAndUpdate(
        { userId },
        { $set: { ...update, userId } },
        {
          new: true,
          upsert: true,
          setDefaultsOnInsert: true,
          runValidators: true,
        },
      )
      .lean()
      .exec();
  }

  findAiSettingsByOrganization(organizationId: string) {
    return this.aiSettingModel.findOne({ organizationId }).lean().exec();
  }

  upsertAiSettings(organizationId: string, update: Record<string, unknown>) {
    return this.aiSettingModel
      .findOneAndUpdate(
        { organizationId },
        { $set: { ...update, organizationId } },
        {
          new: true,
          upsert: true,
          setDefaultsOnInsert: true,
          runValidators: true,
        },
      )
      .lean()
      .exec();
  }
}
