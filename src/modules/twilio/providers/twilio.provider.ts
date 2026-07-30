import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import twilio from 'twilio';

@Injectable()
export class TwilioProvider {
  private readonly client: twilio.Twilio;

  constructor(private readonly config: ConfigService) {
    const accountSid = this.config.get<string>('twilio.accountSid') || '';
    const authToken = this.config.get<string>('twilio.authToken') || '';
    this.client = twilio(accountSid, authToken);
  }

  async createCall(params: {
    to: string;
    from: string;
    url: string;
    statusCallback?: string;
  }) {
    // Uncomment when real credentials/webhooks are ready.
    // return this.client.calls.create(params);
    return { sid: `dev_${Date.now()}`, from: params.from, to: params.to };
  }

  twiml() {
    return new twilio.twiml.VoiceResponse();
  }
}
