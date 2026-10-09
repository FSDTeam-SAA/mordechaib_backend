import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { CallTranscriptSegment } from '../../database/schemas/call-log.schema';
import { AiJobsQueue } from '../ai-integration/ai-jobs.queue';
import { CallRecordsService } from '../calls/call-records.service';
import { TwilioTranscriptionWebhookDto } from './dto/twilio-transcription-webhook.dto';

type TranscriptionData = {
  transcript?: unknown;
  confidence?: unknown;
};

@Injectable()
export class TwilioTranscriptionService {
  private readonly logger = new Logger(TwilioTranscriptionService.name);

  constructor(
    private readonly callRecords: CallRecordsService,
    private readonly aiJobs: AiJobsQueue,
  ) {}

  async handleWebhook(body: TwilioTranscriptionWebhookDto) {
    const callSid = this.required(body.CallSid, 'CallSid');
    const transcriptionSid = this.required(
      body.TranscriptionSid,
      'TranscriptionSid',
    );
    const event = this.required(
      body.TranscriptionEvent,
      'TranscriptionEvent',
    ).toLowerCase();

    switch (event) {
      case 'transcription-started':
        await this.callRecords.startTranscription({
          callSid,
          transcriptionSid,
        });
        break;
      case 'transcription-content':
        await this.handleContent(callSid, transcriptionSid, body);
        break;
      case 'transcription-stopped':
        await this.handleStopped(callSid, transcriptionSid);
        break;
      case 'transcription-error':
        await this.callRecords.failTranscription({
          callSid,
          transcriptionSid,
          reason: this.errorReason(body),
        });
        break;
      default:
        throw new BadRequestException(
          `Unsupported Twilio transcription event: ${event}`,
        );
    }

    return { received: true };
  }

  async reconcileRecording(input: {
    recordingId: string;
    callSids: string[];
  }) {
    const result = await this.callRecords.transcriptionResultForCallSids(
      input.callSids,
    );
    if (!result) return { attached: false };
    if (result.status === 'FAILED') {
      await this.callRecords.markRecordingTranscriptionFailed({
        recordingId: input.recordingId,
        transcriptionSid: result.transcriptionSid,
        reason: result.reason,
      });
      return { attached: true, failed: true };
    }
    return this.attachAndQueue(input.recordingId, {
      transcriptionSid: result.transcriptionSid,
      transcriptText: result.transcriptText,
      transcriptSegments: result.transcriptSegments,
      completedAt: result.completedAt,
    });
  }

  private async handleContent(
    callSid: string,
    transcriptionSid: string,
    body: TwilioTranscriptionWebhookDto,
  ) {
    if (!this.isFinal(body.Final)) return;
    const data = this.transcriptionData(body.TranscriptionData);
    const text =
      typeof data.transcript === 'string' ? data.transcript.trim() : '';
    if (!text) return;
    const sequenceId = this.nonNegativeInteger(body.SequenceId, 'SequenceId');
    const track = body.Track?.trim() || 'unknown_track';
    const segment: CallTranscriptSegment = {
      eventKey: `${transcriptionSid}:${sequenceId}:${track}`,
      sequenceId,
      track,
      speakerLabel: this.speakerLabel(track),
      text,
      ...(typeof data.confidence === 'number' &&
      Number.isFinite(data.confidence)
        ? { confidence: data.confidence }
        : {}),
      ...(body.LanguageCode?.trim()
        ? { languageCode: body.LanguageCode.trim() }
        : {}),
      ...(body.Timestamp && !Number.isNaN(Date.parse(body.Timestamp))
        ? { timestamp: new Date(body.Timestamp) }
        : {}),
    };
    await this.callRecords.appendTranscriptionSegment({
      callSid,
      transcriptionSid,
      segment,
    });
  }

  private async handleStopped(callSid: string, transcriptionSid: string) {
    const completed = await this.callRecords.completeTranscription({
      callSid,
      transcriptionSid,
    });
    if (!completed.transcriptText) {
      this.logger.warn(
        `Twilio transcription completed without text: callSid=${callSid}, transcriptionSid=${transcriptionSid}`,
      );
      return;
    }
    const recording = await this.callRecords.findRecordingForCallSids([
      callSid,
      completed.call.callSid,
      completed.call.dialCallSid,
      completed.call.parentCallSid,
    ].filter((value): value is string => Boolean(value)));
    if (!recording) {
      this.logger.log(
        `Twilio transcript is ready and waiting for its recording: callSid=${callSid}, transcriptionSid=${transcriptionSid}`,
      );
      return;
    }
    await this.attachAndQueue(String(recording._id), {
      transcriptionSid,
      transcriptText: completed.transcriptText,
      transcriptSegments: completed.segments,
      completedAt: completed.completedAt,
    });
  }

  private async attachAndQueue(
    recordingId: string,
    transcript: {
      transcriptionSid: string;
      transcriptText: string;
      transcriptSegments: CallTranscriptSegment[];
      completedAt: Date;
    },
  ) {
    const recording = await this.callRecords.attachTranscriptToRecording({
      recordingId,
      ...transcript,
    });
    if (!recording) return { attached: false, duplicate: true };
    const analysis = await this.aiJobs.enqueueSourceAnalysis({
      organizationId: recording.organizationId,
      sourceType: 'CALL_TRANSCRIPT',
      sourceId: String(recording._id),
    });
    return { attached: true, analysis };
  }

  private transcriptionData(value: string | undefined): TranscriptionData {
    if (!value) {
      throw new BadRequestException('Missing Twilio field: TranscriptionData');
    }
    try {
      const parsed = JSON.parse(value) as TranscriptionData;
      if (!parsed || typeof parsed !== 'object') throw new Error();
      return parsed;
    } catch {
      throw new BadRequestException('Invalid Twilio TranscriptionData JSON');
    }
  }

  private isFinal(value: string | undefined) {
    return value?.trim().toLowerCase() === 'true';
  }

  private speakerLabel(track: string) {
    if (track === 'inbound_track') return 'Inbound participant';
    if (track === 'outbound_track') return 'Outbound participant';
    return 'Participant';
  }

  private nonNegativeInteger(value: string | undefined, field: string) {
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < 0) {
      throw new BadRequestException(`Invalid Twilio field: ${field}`);
    }
    return parsed;
  }

  private required(value: string | undefined, field: string) {
    if (!value?.trim()) {
      throw new BadRequestException(`Missing Twilio field: ${field}`);
    }
    return value.trim();
  }

  private errorReason(body: TwilioTranscriptionWebhookDto) {
    const code =
      body.TranscriptionErrorCode?.trim() || body.ErrorCode?.trim();
    const message =
      body.TranscriptionError?.trim() ||
      body.ErrorMessage?.trim() ||
      'Twilio transcription failed';
    return `${code ? `${code}: ` : ''}${message}`.slice(0, 2000);
  }
}
