import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { TwilioSettingStatus } from '../../common/enums/twilio-setting-status.enum';
import { TwilioSetting } from '../../database/schemas/twilio-setting.schema';

@Injectable()
export class TwilioSettingsRepository {
  constructor(
    @InjectModel(TwilioSetting.name)
    private readonly settingModel: Model<TwilioSetting>,
  ) {}

  findByTwilioNumber(twilioNumber: string) {
    return this.settingModel.findOne({ twilioNumber }).lean().exec();
  }

  findActiveByTwilioNumber(twilioNumber: string) {
    return this.settingModel
      .findOne({ twilioNumber, status: TwilioSettingStatus.ACTIVE })
      .lean()
      .exec();
  }

  findActiveByOrganization(organizationId: string) {
    return this.settingModel
      .findOne({ organizationId, status: TwilioSettingStatus.ACTIVE })
      .lean()
      .exec();
  }

  upsert(
    organizationId: string,
    input: {
      twilioNumber: string;
      forwardingNumber: string;
      isRecordingEnabled: boolean;
      status: TwilioSettingStatus;
    },
  ) {
    return this.settingModel
      .findOneAndUpdate(
        { organizationId },
        { $set: input },
        { new: true, upsert: true, runValidators: true },
      )
      .lean()
      .exec();
  }

  updateForwardingNumber(organizationId: string, forwardingNumber: string) {
    return this.settingModel
      .findOneAndUpdate(
        { organizationId },
        { $set: { forwardingNumber } },
        { new: true, runValidators: true },
      )
      .lean()
      .exec();
  }

  deactivate(organizationId: string) {
    return this.settingModel
      .findOneAndUpdate(
        { organizationId },
        { $set: { status: TwilioSettingStatus.INACTIVE } },
        { new: true },
      )
      .lean()
      .exec();
  }
}
