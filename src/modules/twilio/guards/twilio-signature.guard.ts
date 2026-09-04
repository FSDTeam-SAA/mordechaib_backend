import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import twilio from 'twilio';
import { TwilioAccountsService } from '../twilio-accounts.service';

type TwilioRequest = {
  body: Record<string, string>;
  headers: Record<string, string | string[] | undefined>;
  originalUrl: string;
};

@Injectable()
export class TwilioSignatureGuard implements CanActivate {
  constructor(
    private readonly config: ConfigService,
    private readonly accounts: TwilioAccountsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<TwilioRequest>();
    const signatureHeader = request.headers['x-twilio-signature'];
    const signature = Array.isArray(signatureHeader)
      ? signatureHeader[0]
      : signatureHeader;

    const accountContext = request.body.AccountSid
      ? await this.accounts.contextForSubaccount(request.body.AccountSid)
      : undefined;
    const authToken =
      accountContext?.authToken || this.config.get<string>('twilio.authToken');
    const appBaseUrl = this.config.get<string>('APP_BASE_URL');

    if (!authToken || !appBaseUrl) {
      throw new ServiceUnavailableException(
        'Twilio webhook validation is not configured',
      );
    }
    if (!signature) {
      throw new UnauthorizedException('Missing Twilio signature');
    }

    const baseUrl = appBaseUrl.trim().replace(/\/+$/, '');
    const webhookUrl = `${baseUrl}${request.originalUrl}`;

    // Voice webhooks are form-urlencoded. Twilio signs the public URL plus
    // the parsed form fields; raw-body validation is for JSON + bodySHA256.
    const isValid = twilio.validateRequest(
      authToken,
      signature,
      webhookUrl,
      request.body,
    );
    if (!isValid) {
      throw new UnauthorizedException('Invalid Twilio signature');
    }
    return true;
  }
}
