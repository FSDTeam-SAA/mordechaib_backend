import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import twilio from 'twilio';

@Injectable()
export class TwilioProvider {
  private readonly client: twilio.Twilio;
  private readonly logger = new Logger(TwilioProvider.name);

  constructor(private readonly config: ConfigService) {
    const accountSid = this.config.get<string>('twilio.accountSid') || '';
    const authToken = this.config.get<string>('twilio.authToken') || '';
    this.client = twilio(accountSid, authToken);
  }

  /**
   * Creates an outbound call via Twilio REST API.
   * In development the call is mocked unless TWILIO_LIVE_MODE=true.
   */
  async createCall(params: {
    to: string;
    from: string;
    url: string;
    statusCallback?: string;
  }) {
    if (this.config.get<string>('TWILIO_LIVE_MODE') !== 'true') {
      this.logger.warn(
        'Twilio calls are mocked. Set TWILIO_LIVE_MODE=true to place real calls.',
      );
      return { sid: `dev_${Date.now()}`, from: params.from, to: params.to };
    }
    const call = await this.client.calls.create(params);
    return { sid: call.sid, from: call.from, to: call.to };
  }

  /**
   * Downloads the audio of a completed Twilio recording.
   *
   * Twilio recording URLs (RecordingUrl / MediaUrl) are only accessible with
   * HTTP Basic authentication using the Account SID and Auth Token. The twilio
   * SDK does not expose a direct "download media" helper, so we fetch it
   * ourselves with Basic auth.
   */
  async downloadRecordingMedia(recordingUrl: string): Promise<Buffer> {
    const accountSid = this.config.get<string>('twilio.accountSid') || '';
    const authToken = this.config.get<string>('twilio.authToken') || '';

    if (!accountSid || !authToken) {
      throw new Error('Twilio credentials are not configured');
    }

    const response = await fetch(recordingUrl, {
      headers: {
        Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`,
      },
    });

    if (!response.ok) {
      throw new Error(
        `Twilio media download failed: ${response.status} ${response.statusText}`,
      );
    }

    return Buffer.from(await response.arrayBuffer());
  }

  twiml() {
    return new twilio.twiml.VoiceResponse();
  }
}
