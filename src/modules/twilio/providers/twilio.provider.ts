import { BadGatewayException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import crypto from 'crypto';
import twilio from 'twilio';
import { TwilioCountry } from '../../../common/enums/twilio-country.enum';

type TwilioApiError = {
  status?: number;
  code?: number;
  message?: string;
  moreInfo?: string;
};

export type TwilioAccountContext = {
  accountSid: string;
  authToken: string;
};

export type SearchAvailableNumbersInput = {
  country: TwilioCountry;
  areaCode?: number;
  contains?: string;
  locality?: string;
  region?: string;
  limit: number;
};

@Injectable()
export class TwilioProvider {
  private readonly parentClient: twilio.Twilio;
  private readonly logger = new Logger(TwilioProvider.name);

  constructor(private readonly config: ConfigService) {
    const accountSid = this.config.get<string>('twilio.accountSid') || '';
    const authToken = this.config.get<string>('twilio.authToken') || '';
    this.parentClient = twilio(accountSid, authToken);
  }

  async searchAvailableLocalNumbers(input: SearchAvailableNumbersInput) {
    if (!this.isLiveMode) return this.mockAvailableNumbers(input);

    try {
      const numbers = await this.parentClient
        .availablePhoneNumbers(input.country)
        .local.list({
          areaCode:
            input.country === TwilioCountry.US ? input.areaCode : undefined,
          contains: input.contains,
          inLocality: input.locality,
          inRegion: input.region,
          voiceEnabled: true,
          limit: input.limit,
        });

      return numbers.map((number) => ({
        phoneNumber: number.phoneNumber,
        friendlyName: number.friendlyName,
        country: number.isoCountry,
        locality: number.locality || undefined,
        region: number.region || undefined,
        postalCode: number.postalCode || undefined,
        addressRequirements: number.addressRequirements || undefined,
        capabilities: {
          voice: Boolean(number.capabilities?.voice),
          sms: Boolean(number.capabilities?.sms),
          mms: Boolean(number.capabilities?.mms),
        },
      }));
    } catch (error) {
      this.throwApiError('number search', error);
    }
  }

  async createSubaccount(friendlyName: string) {
    if (!this.isLiveMode) {
      return {
        sid: this.mockSid('AC'),
        authToken: crypto.randomBytes(32).toString('hex'),
        friendlyName,
        status: 'active',
      };
    }

    try {
      const account = await this.parentClient.api.v2010.accounts.create({
        friendlyName,
      });
      return {
        sid: account.sid,
        authToken: account.authToken,
        friendlyName: account.friendlyName,
        status: account.status,
      };
    } catch (error) {
      this.throwApiError('subaccount creation', error);
    }
  }

  async findSubaccountByFriendlyName(friendlyName: string) {
    if (!this.isLiveMode) return undefined;

    try {
      const accounts = await this.parentClient.api.v2010.accounts.list({
        friendlyName,
        limit: 10,
      });
      const account = accounts.find((item) => item.status !== 'closed');
      if (!account) return undefined;
      if (accounts.filter((item) => item.status !== 'closed').length > 1) {
        this.logger.warn(
          `Multiple open Twilio subaccounts use friendly name ${friendlyName}; reusing ${account.sid}`,
        );
      }
      return {
        sid: account.sid,
        authToken: account.authToken,
        friendlyName: account.friendlyName,
        status: account.status,
      };
    } catch (error) {
      this.throwApiError('subaccount recovery lookup', error);
    }
  }

  async findOwnedPhoneNumber(
    context: TwilioAccountContext,
    phoneNumber: string,
  ) {
    if (!this.isLiveMode) return undefined;
    try {
      const [number] = await this.clientFor(context).incomingPhoneNumbers.list({
        phoneNumber,
        limit: 1,
      });
      return number ? this.toOwnedNumber(number) : undefined;
    } catch (error) {
      this.throwApiError('owned number lookup', error);
    }
  }

  async purchasePhoneNumber(
    context: TwilioAccountContext,
    input: { phoneNumber: string; friendlyName: string },
  ) {
    if (!this.isLiveMode) {
      return {
        sid: this.mockSid('PN'),
        phoneNumber: input.phoneNumber,
        capabilities: { voice: true, sms: false, mms: false },
      };
    }

    try {
      const number = await this.clientFor(context).incomingPhoneNumbers.create({
        phoneNumber: input.phoneNumber,
        friendlyName: input.friendlyName,
      });
      return this.toOwnedNumber(number);
    } catch (error) {
      this.throwApiError('phone number purchase', error);
    }
  }

  async configureVoiceWebhook(
    context: TwilioAccountContext,
    phoneNumberSid: string,
    voiceUrl: string,
  ) {
    if (!this.isLiveMode) {
      return { sid: phoneNumberSid, voiceUrl, voiceMethod: 'POST' };
    }
    try {
      const number = await this.clientFor(context)
        .incomingPhoneNumbers(phoneNumberSid)
        .update({ voiceUrl, voiceMethod: 'POST' });
      return {
        sid: number.sid,
        voiceUrl: number.voiceUrl,
        voiceMethod: number.voiceMethod,
      };
    } catch (error) {
      this.throwApiError('voice webhook configuration', error);
    }
  }

  async updateSubaccountStatus(
    subaccountSid: string,
    status: 'active' | 'suspended' | 'closed',
  ) {
    if (!this.isLiveMode) return { sid: subaccountSid, status };
    try {
      const account = await this.parentClient.api.v2010
        .accounts(subaccountSid)
        .update({ status });
      return { sid: account.sid, status: account.status };
    } catch (error) {
      this.throwApiError(`subaccount ${status}`, error);
    }
  }

  async releasePhoneNumber(
    context: TwilioAccountContext,
    phoneNumberSid: string,
  ) {
    if (!this.isLiveMode) return true;
    try {
      return await this.clientFor(context)
        .incomingPhoneNumbers(phoneNumberSid)
        .remove();
    } catch (error) {
      // A retry after Twilio accepted the delete but before our database was
      // updated is already successful from the platform's point of view.
      if ((error as TwilioApiError)?.code === 20404) return true;
      this.throwApiError('phone number release', error);
    }
  }

  /**
   * Creates an outbound call via Twilio REST API.
   * In development the call is mocked unless TWILIO_LIVE_MODE=true.
   */
  async createCall(
    params: {
      to: string;
      from: string;
      url: string;
      statusCallback?: string;
    },
    context?: TwilioAccountContext,
  ) {
    if (!this.isLiveMode) {
      this.logger.warn(
        'Twilio calls are mocked. Set TWILIO_LIVE_MODE=true to place real calls.',
      );
      return { sid: `dev_${Date.now()}`, from: params.from, to: params.to };
    }

    try {
      const call = await this.clientFor(context).calls.create(params);
      return { sid: call.sid, from: call.from, to: call.to };
    } catch (error: unknown) {
      const twilioError = error as TwilioApiError;
      const message =
        twilioError?.message || 'Unknown Twilio error while creating call';
      this.logger.error(
        `Twilio createCall failed: ${message} (code=${twilioError?.code ?? 'n/a'}, status=${twilioError?.status ?? 'n/a'})`,
      );
      throw new BadGatewayException(`Twilio call failed: ${message}`);
    }
  }

  /**
   * Ends an active call via the Twilio REST API.
   * In development this is a no-op because calls are mocked.
   */
  async hangupCall(callSid: string, context?: TwilioAccountContext) {
    if (!this.isLiveMode) {
      this.logger.warn(
        `Hangup mocked for call ${callSid}. Set TWILIO_LIVE_MODE=true to actually end calls.`,
      );
      return { sid: callSid, status: 'completed' };
    }

    const call = await this.clientFor(context)
      .calls(callSid)
      .update({ status: 'completed' });
    return { sid: call.sid, status: call.status };
  }

  /**
   * Downloads the audio of a completed Twilio recording.
   *
   * Twilio recording URLs (RecordingUrl / MediaUrl) are only accessible with
   * HTTP Basic authentication using the Account SID and Auth Token. The twilio
   * SDK does not expose a direct "download media" helper, so we fetch it
   * ourselves with Basic auth.
   */
  async downloadRecordingMedia(
    recordingUrl: string,
    context?: TwilioAccountContext,
  ): Promise<Buffer> {
    const accountSid =
      context?.accountSid || this.config.get<string>('twilio.accountSid') || '';
    const authToken =
      context?.authToken || this.config.get<string>('twilio.authToken') || '';

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

  private get isLiveMode() {
    return this.config.get<boolean>('twilio.liveMode') === true;
  }

  private clientFor(context?: TwilioAccountContext) {
    if (!context) return this.parentClient;
    return twilio(context.accountSid, context.authToken, {
      accountSid: context.accountSid,
    });
  }

  private toOwnedNumber(number: {
    sid: string;
    phoneNumber: string;
    capabilities?: { voice?: boolean; sms?: boolean; mms?: boolean };
  }) {
    return {
      sid: number.sid,
      phoneNumber: number.phoneNumber,
      capabilities: {
        voice: Boolean(number.capabilities?.voice),
        sms: Boolean(number.capabilities?.sms),
        mms: Boolean(number.capabilities?.mms),
      },
    };
  }

  private mockAvailableNumbers(input: SearchAvailableNumbersInput) {
    const prefixes: Record<TwilioCountry, string> = {
      [TwilioCountry.US]: '+1415555',
      [TwilioCountry.GB]: '+44207946',
      [TwilioCountry.FR]: '+3318971',
    };
    return Array.from({ length: Math.min(input.limit, 5) }, (_, index) => {
      const phoneNumber = `${prefixes[input.country]}${String(1000 + index)}`;
      return {
        phoneNumber,
        friendlyName: phoneNumber,
        country: input.country,
        locality: input.locality,
        region: input.region,
        capabilities: { voice: true, sms: false, mms: false },
      };
    });
  }

  private mockSid(prefix: 'AC' | 'PN') {
    return `${prefix}${crypto.randomBytes(16).toString('hex')}`;
  }

  private throwApiError(operation: string, error: unknown): never {
    const twilioError = error as TwilioApiError;
    const message = twilioError?.message || `Unknown Twilio ${operation} error`;
    this.logger.error(
      `Twilio ${operation} failed: ${message} (code=${twilioError?.code ?? 'n/a'}, status=${twilioError?.status ?? 'n/a'})`,
    );
    const exception = new BadGatewayException(
      `Twilio ${operation} failed: ${message}`,
    ) as BadGatewayException & { code?: number };
    exception.code = twilioError?.code;
    throw exception;
  }
}
