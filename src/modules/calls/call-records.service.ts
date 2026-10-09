import { Injectable, NotFoundException } from '@nestjs/common';
import { CallStatus } from '../../common/enums/call-status.enum';
import { CallsRepository } from './calls.repository';
import { CallTranscriptSegment } from '../../database/schemas/call-log.schema';

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
    contactId?: string;
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
    storageProvider?: string;
    storageKey?: string;
    storageAssetId?: string;
    storageResourceType?: string;
    storageDeliveryType?: string;
    storageFormat?: string;
  }) {
    const call = await this.findCallForRecording(
      input.primaryCallSid,
      input.providerCallSid,
    );

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
      storageProvider: input.storageProvider,
      storageKey: input.storageKey,
      storageAssetId: input.storageAssetId,
      storageResourceType: input.storageResourceType,
      storageDeliveryType: input.storageDeliveryType,
      storageFormat: input.storageFormat,
    });
  }

  async getOrganizationIdForRecording(
    primaryCallSid: string | undefined,
    providerCallSid: string,
  ) {
    const call = await this.findCallForRecording(
      primaryCallSid,
      providerCallSid,
    );
    return call.organizationId;
  }

  async startTranscription(input: {
    callSid: string;
    transcriptionSid: string;
  }) {
    const call = await this.callsRepository.updateTranscriptionByCallSid(
      input.callSid,
      {
        transcriptionSid: input.transcriptionSid,
        transcriptionStatus: 'PROCESSING',
      },
      { transcriptionError: 1 },
    );
    if (!call) throw new NotFoundException('Call log not found');
    return call;
  }

  async appendTranscriptionSegment(input: {
    callSid: string;
    transcriptionSid: string;
    segment: CallTranscriptSegment;
  }) {
    const call = await this.callsRepository.appendTranscriptionSegment(
      input.callSid,
      input.transcriptionSid,
      input.segment,
    );
    if (call) return call;

    const existing = await this.callsRepository.findByAnyCallSid([
      input.callSid,
    ]);
    if (!existing) throw new NotFoundException('Call log not found');
    return existing;
  }

  async completeTranscription(input: {
    callSid: string;
    transcriptionSid: string;
  }) {
    const call = await this.callsRepository.findByAnyCallSid([input.callSid]);
    if (!call) throw new NotFoundException('Call log not found');
    const segments = this.normalizedTranscriptSegments(
      call.transcriptSegments || [],
    );
    const transcriptText = segments
      .map((segment) => `${segment.speakerLabel}: ${segment.text}`)
      .join('\n')
      .trim();
    const completedAt = new Date();
    const completed = await this.callsRepository.updateTranscriptionByCallSid(
      input.callSid,
      {
        transcriptionSid: input.transcriptionSid,
        transcriptionStatus: transcriptText ? 'COMPLETED' : 'FAILED',
        transcriptText,
        transcriptSegments: segments,
        transcriptionCompletedAt: completedAt,
        ...(transcriptText
          ? {}
          : { transcriptionError: 'Twilio returned no final transcript text' }),
      },
      transcriptText ? { transcriptionError: 1 } : undefined,
    );
    if (!completed) throw new NotFoundException('Call log not found');
    return { call: completed, transcriptText, segments, completedAt };
  }

  async failTranscription(input: {
    callSid: string;
    transcriptionSid: string;
    reason: string;
  }) {
    const call = await this.callsRepository.updateTranscriptionByCallSid(
      input.callSid,
      {
        transcriptionSid: input.transcriptionSid,
        transcriptionStatus: 'FAILED',
        transcriptionError: input.reason,
        transcriptionCompletedAt: new Date(),
      },
    );
    if (!call) throw new NotFoundException('Call log not found');
    await this.callsRepository.markRecordingTranscriptionFailed(
      input.callSid,
      input.transcriptionSid,
      input.reason,
    );
    return call;
  }

  findRecordingForCallSids(callSids: string[]) {
    return this.callsRepository.findRecordingByCallSids(callSids);
  }

  attachTranscriptToRecording(input: {
    recordingId: string;
    transcriptionSid: string;
    transcriptText: string;
    transcriptSegments: CallTranscriptSegment[];
    completedAt: Date;
  }) {
    return this.callsRepository.attachTranscriptToRecording(input);
  }

  markRecordingTranscriptionFailed(input: {
    recordingId: string;
    transcriptionSid: string;
    reason: string;
  }) {
    return this.callsRepository.markRecordingTranscriptionFailedById(
      input.recordingId,
      input.transcriptionSid,
      input.reason,
    );
  }

  async transcriptionResultForCallSids(callSids: string[]) {
    const call = await this.callsRepository.findByAnyCallSid(callSids);
    if (!call?.transcriptionSid) return undefined;
    if (call.transcriptionStatus === 'FAILED') {
      return {
        status: 'FAILED' as const,
        transcriptionSid: call.transcriptionSid,
        reason: call.transcriptionError || 'Twilio transcription failed',
      };
    }
    if (call.transcriptionStatus !== 'COMPLETED' || !call.transcriptText) {
      return undefined;
    }
    return {
      status: 'COMPLETED' as const,
      transcriptionSid: call.transcriptionSid,
      transcriptText: call.transcriptText,
      transcriptSegments: this.normalizedTranscriptSegments(
        call.transcriptSegments || [],
      ),
      completedAt: call.transcriptionCompletedAt || new Date(),
    };
  }

  private async findCallForRecording(
    primaryCallSid: string | undefined,
    providerCallSid: string,
  ) {
    const candidateCallSids = [primaryCallSid, providerCallSid].filter(
      (value): value is string => Boolean(value),
    );
    const call = await this.callsRepository.findByAnyCallSid(candidateCallSids);
    if (!call) throw new NotFoundException('Call log not found');
    return call;
  }

  private normalizedTranscriptSegments(segments: CallTranscriptSegment[]) {
    return [...segments]
      .filter((segment) => Boolean(segment.text?.trim()))
      .sort((left, right) => {
        if (left.sequenceId !== right.sequenceId) {
          return left.sequenceId - right.sequenceId;
        }
        return left.track.localeCompare(right.track);
      });
  }
}
