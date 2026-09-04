import { Injectable, NotFoundException } from '@nestjs/common';
import { CallStatus } from '../../common/enums/call-status.enum';
import { CallsRepository } from './calls.repository';

@Injectable()
export class CallRecordsService {
  constructor(private readonly callsRepository: CallsRepository) {}

  recordInboundCall(input: {
    organizationId: string;
    callSid: string;
    parentCallSid?: string;
    accountSid: string;
    fromNumber: string;
    toNumber: string;
    twilioNumber: string;
    forwardingNumber: string;
    status: CallStatus;
  }) {
    return this.callsRepository.upsertInboundCall(input);
  }

  recordOutboundCall(input: {
    organizationId: string;
    callSid: string;
    fromNumber: string;
    toNumber: string;
    twilioNumber: string;
    accountSid?: string;
    status: CallStatus;
  }) {
    return this.callsRepository.upsertOutboundCall(input);
  }

  async updateCallStatus(input: {
    callSid: string;
    status: CallStatus;
    durationSeconds?: number;
    price?: number;
    priceUnit?: string;
    endedAt?: Date;
  }) {
    const call = await this.callsRepository.updateByCallSid(input.callSid, {
      status: input.status,
      durationSeconds: input.durationSeconds,
      price: input.price,
      priceUnit: input.priceUnit,
      endedAt: input.endedAt,
    });

    if (!call) throw new NotFoundException('Call log not found');
    return call;
  }

  async recordDialStatus(input: {
    callSid: string;
    dialCallSid?: string;
    status: CallStatus;
    durationSeconds?: number;
  }) {
    const call = await this.callsRepository.updateDialStatus(input.callSid, {
      dialCallSid: input.dialCallSid,
      status: input.status,
      durationSeconds: input.durationSeconds,
      endedAt: new Date(),
    });

    if (!call) throw new NotFoundException('Call log not found');
    return call;
  }

  async recordCompletedRecording(input: {
    primaryCallSid?: string;
    providerCallSid: string;
    recordingSid: string;
    recordingUrl: string;
    recordingStatus: string;
    recordingDuration?: number;
    recordingChannels?: number;
    localFilePath?: string;
  }) {
    const candidateCallSids = [
      input.primaryCallSid,
      input.providerCallSid,
    ].filter((value): value is string => Boolean(value));

    const call = await this.callsRepository.findByAnyCallSid(candidateCallSids);
    if (!call) throw new NotFoundException('Call log not found');

    return this.callsRepository.upsertRecording({
      organizationId: call.organizationId,
      callSid: call.callSid,
      providerCallSid: input.providerCallSid,
      recordingSid: input.recordingSid,
      recordingUrl: input.recordingUrl,
      recordingStatus: input.recordingStatus,
      recordingDuration: input.recordingDuration,
      recordingChannels: input.recordingChannels,
      localFilePath: input.localFilePath,
    });
  }
}
