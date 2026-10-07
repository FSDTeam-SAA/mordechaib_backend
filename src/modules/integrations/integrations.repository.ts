import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Integration } from '../../database/schemas/integration.schema';
import { TwilioAccount } from '../../database/schemas/twilio-account.schema';
import { TwilioSetting } from '../../database/schemas/twilio-setting.schema';
import { TwilioPhoneNumber } from '../../database/schemas/twilio-phone-number.schema';
import { TwilioPhoneNumberStatus } from '../../common/enums/twilio-phone-number-status.enum';

@Injectable()
export class IntegrationsRepository {
  constructor(
    @InjectModel(Integration.name)
    private readonly integrationModel: Model<Integration>,
    @InjectModel(TwilioAccount.name)
    private readonly twilioAccountModel: Model<TwilioAccount>,
    @InjectModel(TwilioSetting.name)
    private readonly twilioSettingModel: Model<TwilioSetting>,
    @InjectModel(TwilioPhoneNumber.name)
    private readonly twilioPhoneNumberModel: Model<TwilioPhoneNumber>,
  ) {}

  findByOrganization(organizationId: string) {
    return this.integrationModel
      .find({ organizationId })
      .select('-accessToken -refreshToken')
      .lean()
      .exec();
  }

  findTwilioAccount(organizationId: string) {
    return this.twilioAccountModel.findOne({ organizationId }).lean().exec();
  }

  findTwilioSetting(organizationId: string) {
    return this.twilioSettingModel.findOne({ organizationId }).lean().exec();
  }

  findActiveTwilioPhoneNumber(organizationId: string) {
    return this.twilioPhoneNumberModel
      .findOne({
        organizationId,
        status: TwilioPhoneNumberStatus.ACTIVE,
      })
      .lean()
      .exec();
  }
}
