import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  PlatformSetting,
  PlatformSettingKey,
} from '../../database/schemas/platform-setting.schema';

@Injectable()
export class PlatformSettingsRepository {
  constructor(
    @InjectModel(PlatformSetting.name)
    private readonly settings: Model<PlatformSetting>,
  ) {}

  find() {
    return this.settings
      .findOne({ key: PlatformSettingKey.GLOBAL })
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
        { key: PlatformSettingKey.GLOBAL, revision: expectedRevision },
        {
          $set: { ...changes, updatedByUserId },
          $setOnInsert: { key: PlatformSettingKey.GLOBAL },
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
