import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import twilio from 'twilio';

type TwilioRequest = {
  body: Record<string, string>;
  headers: Record<string, string | string[] | undefined>;
  originalUrl: string;
};

@Injectable()
export class TwilioSignatureGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<TwilioRequest>();
    const signatureHeader = request.headers['x-twilio-signature'];
    const signature = Array.isArray(signatureHeader)
      ? signatureHeader[0]
      : signatureHeader;
    const authToken = this.config.get<string>('twilio.authToken');
    const appBaseUrl = this.config.get<string>('APP_BASE_URL');

    if (!authToken || !appBaseUrl) {
      throw new ServiceUnavailableException(
        'Twilio webhook validation is not configured',
      );
    }

    if (!signature) {
      throw new UnauthorizedException('Missing Twilio signature');
    }

    const webhookUrl = `${appBaseUrl.replace(/\/+$/, '')}${request.originalUrl}`;
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
