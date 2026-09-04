import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { TwilioCountry } from '../../common/enums/twilio-country.enum';
import { TwilioPhoneNumberStatus } from '../../common/enums/twilio-phone-number-status.enum';
import { TwilioPhoneNumber } from '../../database/schemas/twilio-phone-number.schema';

type SavePurchasedNumberInput = {
  organizationId: string;
  subaccountSid: string;
  phoneNumberSid: string;
  phoneNumber: string;
  country: TwilioCountry;
  capabilities: { voice: boolean; sms: boolean; mms: boolean };
  addressRequirements?: string;
};

@Injectable()
export class TwilioPhoneNumbersRepository {
  constructor(
    @InjectModel(TwilioPhoneNumber.name)
    private readonly numberModel: Model<TwilioPhoneNumber>,
  ) {}

  findActiveByOrganization(organizationId: string) {
    return this.numberModel
      .findOne({
        organizationId,
        status: TwilioPhoneNumberStatus.ACTIVE,
      })
      .lean()
      .exec();
  }

  savePurchased(input: SavePurchasedNumberInput) {
    return this.numberModel
      .findOneAndUpdate(
        { phoneNumberSid: input.phoneNumberSid },
        {
          $setOnInsert: {
            ...input,
            numberType: 'LOCAL',
            purchasedAt: new Date(),
          },
          $set: { status: TwilioPhoneNumberStatus.ACTIVE },
        },
        { new: true, upsert: true, runValidators: true },
      )
      .lean()
      .exec();
  }

  markVoiceConfigured(
    organizationId: string,
    phoneNumberSid: string,
    voiceUrl: string,
  ) {
    return this.numberModel
      .findOneAndUpdate(
        { organizationId, phoneNumberSid },
        { $set: { voiceUrl } },
        { new: true },
      )
      .lean()
      .exec();
  }

  markReleasing(organizationId: string) {
    return this.numberModel
      .findOneAndUpdate(
        {
          organizationId,
          status: {
            $in: [
              TwilioPhoneNumberStatus.ACTIVE,
              TwilioPhoneNumberStatus.RELEASING,
            ],
          },
        },
        { $set: { status: TwilioPhoneNumberStatus.RELEASING } },
        { new: true },
      )
      .lean()
      .exec();
  }

  markReleased(organizationId: string, phoneNumberSid: string) {
    return this.numberModel
      .findOneAndUpdate(
        { organizationId, phoneNumberSid },
        {
          $set: {
            status: TwilioPhoneNumberStatus.RELEASED,
            releasedAt: new Date(),
          },
        },
        { new: true },
      )
      .lean()
      .exec();
  }
}
