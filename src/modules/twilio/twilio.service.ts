import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TwilioProvider } from './providers/twilio.provider';
import { TwilioVoiceWebhookDto } from './dto/twilio-voice-webhook.dto';

@Injectable()
export class TwilioService {
  constructor(
    private readonly config: ConfigService,
    private readonly twilioProvider: TwilioProvider,
  ) {}

  handleIncomingCall(body: TwilioVoiceWebhookDto): string {
    void body;
    const response = this.twilioProvider.twiml();

    // TODO: Find organization and forwarding number by body.To from DB.
    const forwardingNumber = '+8801700000000';

    const dial = response.dial({
      record: 'record-from-answer-dual',
      recordingStatusCallback: `${this.config.get('APP_BASE_URL')}/api/v1/webhooks/twilio/recording`,
    });
    dial.number(forwardingNumber);

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

  handleRecordingCallback(body: Record<string, unknown>) {
    // TODO: Save recording and enqueue transcription/AI analysis job.
    return { received: true, body };
  }

  handleCallStatusCallback(body: Record<string, unknown>) {
    // TODO: Update call status in DB.
    return { received: true, body };
  }
}
