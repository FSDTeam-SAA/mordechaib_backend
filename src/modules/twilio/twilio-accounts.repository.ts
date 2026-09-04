import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { TwilioCountry } from '../../common/enums/twilio-country.enum';
import { TwilioProvisioningStatus } from '../../common/enums/twilio-provisioning-status.enum';
import { TwilioAccount } from '../../database/schemas/twilio-account.schema';

type CreateTwilioAccountInput = {
  organizationId: string;
  friendlyName: string;
  selectedCountry: TwilioCountry;
  selectedPhoneNumber: string;
  forwardingNumber: string;
  isRecordingEnabled: boolean;
  operationId: string;
};

@Injectable()
export class TwilioAccountsRepository {
  constructor(
    @InjectModel(TwilioAccount.name)
    private readonly accountModel: Model<TwilioAccount>,
  ) {}

  findByOrganization(organizationId: string) {
    return this.accountModel.findOne({ organizationId }).lean().exec();
  }

  findByOrganizationWithSecret(organizationId: string) {
    return this.accountModel
      .findOne({ organizationId })
      .select('+authTokenEncrypted')
      .lean()
      .exec();
  }

  findBySubaccountSidWithSecret(subaccountSid: string) {
    return this.accountModel
      .findOne({ subaccountSid })
      .select('+authTokenEncrypted')
      .lean()
      .exec();
  }

  createIfMissing(input: CreateTwilioAccountInput) {
    return this.accountModel
      .findOneAndUpdate(
        { organizationId: input.organizationId },
        {
          $setOnInsert: {
            ...input,
            provisioningStatus: TwilioProvisioningStatus.CREATING_SUBACCOUNT,
            retryCount: 0,
            previousSubaccountSids: [],
          },
        },
        { new: true, upsert: true, runValidators: true },
      )
      .lean()
      .exec();
  }

  prepareRetry(
    organizationId: string,
    input?: {
      selectedCountry?: TwilioCountry;
      selectedPhoneNumber?: string;
      operationId?: string;
      forwardingNumber?: string;
      isRecordingEnabled?: boolean;
      restartClosedConnection?: boolean;
    },
  ) {
    const set: Record<string, unknown> = {
      provisioningStatus: TwilioProvisioningStatus.CREATING_SUBACCOUNT,
      lastAttemptAt: new Date(),
      ...(input?.selectedCountry
        ? { selectedCountry: input.selectedCountry }
        : {}),
      ...(input?.selectedPhoneNumber
        ? { selectedPhoneNumber: input.selectedPhoneNumber }
        : {}),
      ...(input?.operationId ? { operationId: input.operationId } : {}),
      ...(input?.forwardingNumber
        ? { forwardingNumber: input.forwardingNumber }
        : {}),
      ...(input?.isRecordingEnabled !== undefined
        ? { isRecordingEnabled: input.isRecordingEnabled }
        : {}),
    };
    const update: Record<string, unknown> = {
      $set: set,
      $unset: {
        lastErrorCode: 1,
        lastErrorMessage: 1,
        closureReason: 1,
        retentionExpiresAt: 1,
      },
      $inc: { retryCount: 1 },
    };

    if (input?.restartClosedConnection) {
      update.$unset = {
        ...(update.$unset as Record<string, number>),
        subaccountSid: 1,
        authTokenEncrypted: 1,
        provisionedAt: 1,
        suspendedAt: 1,
        closedAt: 1,
        remoteStatus: 1,
      };
    }

    return this.accountModel
      .findOneAndUpdate({ organizationId }, update, { new: true })
      .lean()
      .exec();
  }

  updateByOrganization(
    organizationId: string,
    set: Partial<TwilioAccount>,
    unset?: Record<string, 1>,
  ) {
    return this.accountModel
      .findOneAndUpdate(
        { organizationId },
        { $set: set, ...(unset ? { $unset: unset } : {}) },
        { new: true, runValidators: true },
      )
      .lean()
      .exec();
  }

  updateByOperation(
    organizationId: string,
    operationId: string,
    set: Partial<TwilioAccount>,
    unset?: Record<string, 1>,
  ) {
    return this.accountModel
      .findOneAndUpdate(
        { organizationId, operationId },
        { $set: set, ...(unset ? { $unset: unset } : {}) },
        { new: true, runValidators: true },
      )
      .lean()
      .exec();
  }

  rememberClosedSubaccount(
    organizationId: string,
    subaccountSid: string,
    operationId?: string,
  ) {
    return this.accountModel
      .updateOne(
        { organizationId, ...(operationId ? { operationId } : {}) },
        { $addToSet: { previousSubaccountSids: subaccountSid } },
      )
      .exec();
  }
}
