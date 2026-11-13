import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  PlatformNotificationSetting,
  PlatformNotificationSettingKey,
} from '../../database/schemas/platform-notification-setting.schema';

@Injectable()
export class PlatformNotificationSettingsRepository {
  constructor(
    @InjectModel(PlatformNotificationSetting.name)
    private readonly settings: Model<PlatformNotificationSetting>,
  ) {}

  find() {
    return this.settings
      .findOne({ key: PlatformNotificationSettingKey.GLOBAL })
      .lean()
      .exec();
  }

  update(
    expectedRevision: number,
    changes: Record<string, unknown>,
    updatedByUserId: string,
  ) {
    return this.settings
      .findOneAndUpdate(
        {
          key: PlatformNotificationSettingKey.GLOBAL,
          revision: expectedRevision,
        },
        {
          $set: { ...changes, updatedByUserId },
          $setOnInsert: { key: PlatformNotificationSettingKey.GLOBAL },
          $inc: { revision: 1 },
        },
        {
          new: true,
          upsert: expectedRevision === 0,
          setDefaultsOnInsert: true,
          runValidators: true,
        },
      )
      .lean()
      .exec();
  }
}
