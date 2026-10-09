import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CallDirection } from '../../common/enums/call-direction.enum';
import { CallStatus } from '../../common/enums/call-status.enum';
import {
  CallLog,
  CallTranscriptSegment,
} from '../../database/schemas/call-log.schema';
import { CallRecording } from '../../database/schemas/call-recording.schema';

type CreateCallInput = {
  organizationId: string;
  callSid: string;
  parentCallSid?: string;
  fromNumber: string;
  toNumber: string;
  direction: CallDirection;
  status: CallStatus;
};

type UpsertOutboundCallInput = {
  organizationId: string;
  callSid: string;
  fromNumber: string;
  toNumber: string;
  twilioNumber: string;
  accountSid?: string;
  contactId?: string;
  status: CallStatus;
};

type UpsertInboundCallInput = {
  organizationId: string;
  callSid: string;
  parentCallSid?: string;
  accountSid: string;
  fromNumber: string;
  toNumber: string;
  twilioNumber: string;
  forwardingNumber: string;
  status: CallStatus;
};

type UpdateDialStatusInput = {
  status: CallStatus;
  dialCallSid?: string;
  durationSeconds?: number;
  endedAt?: Date;
};

type UpsertRecordingInput = {
  organizationId: string;
  callSid: string;
  providerCallSid: string;
  recordingSid: string;
  recordingUrl: string;
  recordingStatus: string;
  recordingDuration?: number;
  recordingChannels?: number;
  localFilePath?: string;
  storageProvider?: string;
  storageKey?: string;
  storageAssetId?: string;
  storageResourceType?: string;
  storageDeliveryType?: string;
  storageFormat?: string;
};

@Injectable()
export class CallsRepository {
  constructor(
    @InjectModel(CallLog.name) private readonly callModel: Model<CallLog>,
    @InjectModel(CallRecording.name)
    private readonly recordingModel: Model<CallRecording>,
  ) {}

  create(data: CreateCallInput) {
    return this.callModel.create(data);
  }

  findByOrganization(organizationId: string) {
    return this.callModel
      .find({ organizationId })
      .sort({ createdAt: -1 })
      .lean()
      .exec();
  }

  findByCallSid(callSid: string) {
    return this.callModel.findOne({ callSid }).lean().exec();
  }

  upsertOutboundCall(input: UpsertOutboundCallInput) {
    return this.callModel
      .findOneAndUpdate(
        { callSid: input.callSid },
        {
          $setOnInsert: {
            organizationId: input.organizationId,
            callSid: input.callSid,
            fromNumber: input.fromNumber,
            toNumber: input.toNumber,
            twilioNumber: input.twilioNumber,
            accountSid: input.accountSid,
            contactId: input.contactId,
            direction: CallDirection.OUTBOUND,
            startedAt: new Date(),
          },
          $set: {
            status: input.status,
          },
        },
        { new: true, upsert: true },
      )
      .lean()
      .exec();
  }

  updateByCallSid(
    callSid: string,
    input: {
      status?: CallStatus;
      dialCallSid?: string;
      durationSeconds?: number;
      price?: number;
      priceUnit?: string;
      endedAt?: Date;
    },
  ) {
    return this.callModel
      .findOneAndUpdate({ callSid }, { $set: input }, { new: true })
      .lean()
      .exec();
  }

  upsertInboundCall(input: UpsertInboundCallInput) {
    return this.callModel
      .findOneAndUpdate(
        { callSid: input.callSid },
        {
          $setOnInsert: {
            organizationId: input.organizationId,
            callSid: input.callSid,
            parentCallSid: input.parentCallSid,
            fromNumber: input.fromNumber,
            toNumber: input.toNumber,
            twilioNumber: input.twilioNumber,
            forwardingNumber: input.forwardingNumber,
            direction: CallDirection.INBOUND,
            startedAt: new Date(),
          },
          $set: {
            accountSid: input.accountSid,
            status: input.status,
          },
        },
        { new: true, upsert: true },
      )
      .lean()
      .exec();
  }

  updateDialStatus(callSid: string, input: UpdateDialStatusInput) {
    return this.callModel
      .findOneAndUpdate({ callSid }, { $set: input }, { new: true })
      .lean()
      .exec();
  }

  findByAnyCallSid(callSids: string[]) {
    return this.callModel
      .findOne({
        $or: [
          { callSid: { $in: callSids } },
          { parentCallSid: { $in: callSids } },
          { dialCallSid: { $in: callSids } },
        ],
      })
      .lean()
      .exec();
  }

  updateTranscriptionByCallSid(
    callSid: string,
    set: Record<string, unknown>,
    unset?: Record<string, 1>,
  ) {
    return this.callModel
      .findOneAndUpdate(
        {
          $or: [
            { callSid },
            { parentCallSid: callSid },
            { dialCallSid: callSid },
          ],
        },
        { $set: set, ...(unset ? { $unset: unset } : {}) },
        { new: true },
      )
      .lean()
      .exec();
  }

  appendTranscriptionSegment(
    callSid: string,
    transcriptionSid: string,
    segment: CallTranscriptSegment,
  ) {
    return this.callModel
      .findOneAndUpdate(
        {
          $or: [
            { callSid },
            { parentCallSid: callSid },
            { dialCallSid: callSid },
          ],
          'transcriptSegments.eventKey': { $ne: segment.eventKey },
        },
        {
          $set: {
            transcriptionSid,
          },
          $unset: { transcriptionError: 1 },
          $push: { transcriptSegments: segment },
        },
        { new: true },
      )
      .lean()
      .exec();
  }

  findRecordingByCallSids(callSids: string[]) {
    return this.recordingModel
      .findOne({
        $or: [
          { callSid: { $in: callSids } },
          { providerCallSid: { $in: callSids } },
        ],
      })
      .lean()
      .exec();
  }

  attachTranscriptToRecording(input: {
    recordingId: string;
    transcriptionSid: string;
    transcriptText: string;
    transcriptSegments: CallTranscriptSegment[];
    completedAt: Date;
  }) {
    return this.recordingModel
      .findOneAndUpdate(
        {
          _id: input.recordingId,
          $or: [
            { transcriptionSid: { $ne: input.transcriptionSid } },
            { transcriptText: { $ne: input.transcriptText } },
            { aiStatus: { $ne: 'COMPLETED' } },
          ],
        },
        {
          $set: {
            transcriptionSid: input.transcriptionSid,
            transcriptionProvider: 'TWILIO',
            transcriptionStatus: 'COMPLETED',
            transcriptionCompletedAt: input.completedAt,
            transcriptText: input.transcriptText,
            transcriptSegments: input.transcriptSegments,
            aiStatus: 'COMPLETED',
          },
          $unset: { transcriptionError: 1, summary: 1 },
        },
        { new: true },
      )
      .lean()
      .exec();
  }

  markRecordingTranscriptionFailed(
    callSid: string,
    transcriptionSid: string,
    reason: string,
  ) {
    return this.recordingModel
      .findOneAndUpdate(
        {
          $or: [{ callSid }, { providerCallSid: callSid }],
          aiStatus: { $ne: 'COMPLETED' },
        },
        {
          $set: {
            transcriptionSid,
            transcriptionProvider: 'TWILIO',
            transcriptionStatus: 'FAILED',
            transcriptionError: reason,
            aiStatus: 'FAILED',
          },
        },
        { new: true },
      )
      .lean()
      .exec();
  }

  markRecordingTranscriptionFailedById(
    recordingId: string,
    transcriptionSid: string,
    reason: string,
  ) {
    return this.recordingModel
      .findOneAndUpdate(
        { _id: recordingId, aiStatus: { $ne: 'COMPLETED' } },
        {
          $set: {
            transcriptionSid,
            transcriptionProvider: 'TWILIO',
            transcriptionStatus: 'FAILED',
            transcriptionError: reason,
            aiStatus: 'FAILED',
          },
        },
        { new: true },
      )
      .lean()
      .exec();
  }

  upsertRecording(input: UpsertRecordingInput) {
    return this.recordingModel
      .findOneAndUpdate(
        { recordingSid: input.recordingSid },
        {
          $setOnInsert: {
            organizationId: input.organizationId,
            callSid: input.callSid,
            providerCallSid: input.providerCallSid,
            recordingSid: input.recordingSid,
            aiStatus: 'PENDING',
          },
          $set: {
            recordingUrl: input.recordingUrl,
            recordingStatus: input.recordingStatus,
            recordingDuration: input.recordingDuration,
            recordingChannels: input.recordingChannels,
            ...(input.localFilePath
              ? { localFilePath: input.localFilePath }
              : {}),
            ...(input.storageProvider
              ? {
                  storageProvider: input.storageProvider,
                  storageKey: input.storageKey,
                  storageAssetId: input.storageAssetId,
                  storageResourceType: input.storageResourceType,
                  storageDeliveryType: input.storageDeliveryType,
                  storageFormat: input.storageFormat,
                }
              : {}),
          },
        },
        { new: true, upsert: true },
      )
      .lean()
      .exec();
  }
}
