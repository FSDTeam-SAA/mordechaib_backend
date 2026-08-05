import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CallStatus } from '../../common/enums/call-status.enum';
import { CallRecordsService } from '../calls/call-records.service';
import { RecordingStorageService } from './providers/recording-storage.service';
import { TwilioProvider } from './providers/twilio.provider';
import { TwilioVoiceWebhookDto } from './dto/twilio-voice-webhook.dto';
import { TwilioSettingsService } from './twilio-settings.service';

@Injectable()
export class TwilioService {
  constructor(
    private readonly config: ConfigService,
    private readonly twilioProvider: TwilioProvider,
    private readonly settingsService: TwilioSettingsService,
    private readonly callRecordsService: CallRecordsService,
    private readonly recordingStorage: RecordingStorageService,
  ) {}

  async handleIncomingCall(body: TwilioVoiceWebhookDto): Promise<string> {
    const accountSid = this.requiredField(body, 'AccountSid');
    const callSid = this.requiredField(body, 'CallSid');
    const fromNumber = this.requiredField(body, 'From');
    const toNumber = this.requiredField(body, 'To');
    const response = this.twilioProvider.twiml();
    const setting =
      await this.settingsService.findActiveByTwilioNumber(toNumber);

    if (!setting) {
      response.say('This phone number is not currently configured.');
      response.hangup();
      return response.toString();
    }

    await this.callRecordsService.recordInboundCall({
      organizationId: setting.organizationId,
      callSid,
      parentCallSid: body.ParentCallSid,
      accountSid,
      fromNumber,
      toNumber,
      twilioNumber: setting.twilioNumber,
      forwardingNumber: setting.forwardingNumber,
      status: this.mapCallStatus(body.CallStatus, CallStatus.RINGING),
    });

    const callbackQuery = `?callSid=${encodeURIComponent(callSid)}`;
    const dialStatusCallback = this.webhookUrl(`dial-status${callbackQuery}`);

    const dial = setting.isRecordingEnabled
      ? response.dial({
          action: dialStatusCallback,
          method: 'POST',
          answerOnBridge: true,
          record: 'record-from-answer-dual',
          recordingStatusCallback: this.webhookUrl(`recording${callbackQuery}`),
          recordingStatusCallbackEvent: ['completed'],
          recordingStatusCallbackMethod: 'POST',
        })
      : response.dial({
          action: dialStatusCallback,
          method: 'POST',
          answerOnBridge: true,
        });

    dial.number(setting.forwardingNumber);

    return response.toString();
  }

  /**
   * Initiates a click-to-call outbound call.
   *
   * Flow:
   *   1. Twilio calls the agent's phone (first leg).
   *   2. When the agent answers, Twilio fetches TwiML from
   *      `/api/v1/webhooks/twilio/outbound-connect?clientPhone=...`.
   *   3. That TwiML dials the client's phone and bridges both legs.
   *
   * In development (TWILIO_LIVE_MODE unset) the TwilioProvider returns a
   * mocked `dev_*` call SID so the full API + database flow can be tested
   * locally without placing a real call.
   */
  async initiateOutboundCall(input: {
    organizationId: string;
    clientPhone: string;
    agentPhone?: string;
  }) {
    const setting = await this.settingsService.findActiveByOrganization(
      input.organizationId,
    );

    if (!setting) {
      throw new NotFoundException(
        'No active Twilio setting found for this organization. ' +
          'Configure one via POST /api/v1/twilio/settings first.',
      );
    }

    const fromNumber = setting.twilioNumber;
    const agentPhone = input.agentPhone || setting.forwardingNumber;

    if (agentPhone === input.clientPhone) {
      throw new BadRequestException(
        'agentPhone must be different from clientPhone',
      );
    }

    const call = await this.twilioProvider.createCall({
      from: fromNumber,
      to: agentPhone,
      url: this.webhookUrl(
        `outbound-connect?clientPhone=${encodeURIComponent(input.clientPhone)}`,
      ),
      statusCallback: this.webhookUrl('call-status'),
    });

    // Record the outbound call even in mock mode so the full lifecycle
    // (initiate → connect → status → complete) can be tested locally.
    await this.callRecordsService.recordOutboundCall({
      organizationId: input.organizationId,
      callSid: call.sid,
      fromNumber: call.from,
      toNumber: input.clientPhone,
      twilioNumber: fromNumber,
      status: CallStatus.INITIATED,
    });

    return {
      callSid: call.sid,
      status: CallStatus.INITIATED,
      from: call.from,
      to: input.clientPhone,
      agentPhone,
    };
  }

  /**
   * Generates the TwiML that bridges the agent (first leg) to the client
   * (second leg). Twilio calls this endpoint after the agent answers.
   *
   * When the organization has recording enabled, the Dial verb includes
   * `record="record-from-answer-dual"` and a `recordingStatusCallback` so the
   * completed conversation is downloaded and stored on our backend — exactly
   * like the incoming-call forwarding flow.
   */
  async handleOutboundConnect(input: {
    callSid: string;
    clientPhone: string;
    fromNumber: string;
  }): Promise<string> {
    const response = this.twilioProvider.twiml();
    const callQuery = `callSid=${encodeURIComponent(input.callSid)}`;
    const dialStatusCallback = this.webhookUrl(`dial-status?${callQuery}`);

    // `From` is the organization's Twilio number, so we can look up the
    // same setting used for incoming calls to decide whether to record.
    const setting = input.fromNumber
      ? await this.settingsService.findActiveByTwilioNumber(input.fromNumber)
      : undefined;

    const dialAttributes: Record<string, unknown> = {
      action: dialStatusCallback,
      method: 'POST',
      answerOnBridge: true,
      timeout: 30,
    };

    if (input.fromNumber) {
      dialAttributes.callerId = input.fromNumber;
    }

    if (setting?.isRecordingEnabled) {
      const recordingCallback = this.webhookUrl(`recording?${callQuery}`);
      dialAttributes.record = 'record-from-answer-dual';
      dialAttributes.recordingStatusCallback = recordingCallback;
      dialAttributes.recordingStatusCallbackEvent = ['completed'];
      dialAttributes.recordingStatusCallbackMethod = 'POST';
    }

    const dial = response.dial(dialAttributes);
    dial.number(input.clientPhone);

    return response.toString();
  }

  /**
   * Handles the outbound call status lifecycle webhook.
   * Called by Twilio for every state transition (initiated, ringing,
   * in-progress, completed, busy, no-answer, failed, canceled).
   */
  async handleCallStatusCallback(
    body: Record<string, string | undefined>,
  ): Promise<{ received: boolean }> {
    const callSid = this.requiredField(body, 'CallSid');
    const status = this.mapCallStatus(body.CallStatus, CallStatus.FAILED);

    await this.callRecordsService.updateCallStatus({
      callSid,
      status,
      durationSeconds: this.optionalNonNegativeInteger(
        body.CallDuration,
        'CallDuration',
      ),
      price: this.optionalNumber(body.CallPrice, 'CallPrice'),
      priceUnit: body.PriceUnit,
      endedAt: this.isFinalStatus(status) ? new Date() : undefined,
    });

    return { received: true };
  }

  async handleRecordingCallback(
    primaryCallSid: string | undefined,
    body: Record<string, string | undefined>,
  ) {
    const providerCallSid = this.requiredField(body, 'CallSid');
    const recordingSid = this.requiredField(body, 'RecordingSid');
    const recordingUrl = this.requiredField(body, 'RecordingUrl');

    // Download the audio from Twilio and store it locally so the recording
    // is persisted on our backend, not only referenced by a Twilio URL.
    // Failure to store is non-fatal — we still save the metadata and return
    // 200 so Twilio will not retry.
    const localFilePath = await this.recordingStorage.storeRecording({
      callSid: primaryCallSid || providerCallSid,
      recordingSid,
      recordingUrl,
    });

    await this.callRecordsService.recordCompletedRecording({
      primaryCallSid,
      providerCallSid,
      recordingSid,
      recordingUrl,
      recordingStatus: this.requiredField(body, 'RecordingStatus'),
      recordingDuration: this.optionalNonNegativeInteger(
        body.RecordingDuration,
        'RecordingDuration',
      ),
      recordingChannels: this.optionalNonNegativeInteger(
        body.RecordingChannels,
        'RecordingChannels',
      ),
      localFilePath: localFilePath || undefined,
    });

    return { received: true };
  }

  async handleDialStatusCallback(
    primaryCallSid: string | undefined,
    body: Record<string, string | undefined>,
  ) {
    const callSid = primaryCallSid || this.requiredField(body, 'CallSid');

    await this.callRecordsService.recordDialStatus({
      callSid,
      dialCallSid: body.DialCallSid,
      status: this.mapCallStatus(body.DialCallStatus, CallStatus.FAILED),
      durationSeconds: this.optionalNonNegativeInteger(
        body.DialCallDuration,
        'DialCallDuration',
      ),
    });

    return { received: true };
  }

  private webhookUrl(path: string): string {
    const appBaseUrl = (
      this.config.get<string>('APP_BASE_URL') || 'http://localhost:5000'
    ).trim();
    return `${appBaseUrl.replace(/\/+$/, '')}/api/v1/webhooks/twilio/${path}`;
  }

  private requiredField(
    body: Record<string, string | undefined>,
    field: string,
  ): string {
    const value = body[field];
    if (!value || !value.trim()) {
      throw new BadRequestException(`Missing Twilio field: ${field}`);
    }
    return value.trim();
  }

  private optionalNonNegativeInteger(
    value: string | undefined,
    field: string,
  ): number | undefined {
    if (value === undefined || value === '') return undefined;

    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < 0) {
      throw new BadRequestException(`Invalid Twilio field: ${field}`);
    }
    return parsed;
  }

  private optionalNumber(
    value: string | undefined,
    field: string,
  ): number | undefined {
    if (value === undefined || value === '') return undefined;

    const parsed = Number(value);
    if (Number.isNaN(parsed)) {
      throw new BadRequestException(`Invalid Twilio field: ${field}`);
    }
    return parsed;
  }

  private isFinalStatus(status: CallStatus): boolean {
    return [
      CallStatus.COMPLETED,
      CallStatus.FAILED,
      CallStatus.BUSY,
      CallStatus.NO_ANSWER,
      CallStatus.CANCELED,
    ].includes(status);
  }

  private mapCallStatus(
    status: string | undefined,
    fallback: CallStatus,
  ): CallStatus {
    switch (status?.trim().toLowerCase()) {
      case 'queued':
      case 'initiated':
        return CallStatus.INITIATED;
      case 'ringing':
        return CallStatus.RINGING;
      case 'answered':
      case 'in-progress':
        return CallStatus.IN_PROGRESS;
      case 'completed':
        return CallStatus.COMPLETED;
      case 'busy':
        return CallStatus.BUSY;
      case 'no-answer':
        return CallStatus.NO_ANSWER;
      case 'canceled':
      case 'cancelled':
        return CallStatus.CANCELED;
      case 'failed':
        return CallStatus.FAILED;
      default:
        return fallback;
    }
  }
}