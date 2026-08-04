import { BadRequestException, Injectable } from '@nestjs/common';
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

  async startClickToCall(input: {
    organizationId: string;
    clientPhone: string;
  }) {
    const from =
      this.config.get<string>('twilio.defaultNumber') || '+15555555555';
    const appBaseUrl =
      this.config.get<string>('APP_BASE_URL') || 'https://api.noltra.com';

    const call = await this.twilioProvider.createCall({
      from,
      // First call CEO real number. Then TwiML should dial client.
      to: '+8801700000000',
      url: `${appBaseUrl}/api/v1/webhooks/twilio/outbound-connect?clientPhone=${encodeURIComponent(input.clientPhone)}`,
      statusCallback: `${appBaseUrl}/api/v1/webhooks/twilio/call-status`,
    });

    return { callSid: call.sid, from };
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

  handleCallStatusCallback(body: Record<string, string | undefined>) {
    void body;
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
