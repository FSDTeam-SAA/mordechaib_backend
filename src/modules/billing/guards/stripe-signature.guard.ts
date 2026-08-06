import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { StripeProvider } from '../../stripe/stripe.provider';

type StripeWebhookRequest = {
  rawBody?: Buffer;
  headers: Record<string, string | string[] | undefined>;
};

@Injectable()
export class StripeSignatureGuard implements CanActivate {
  constructor(
    private readonly config: ConfigService,
    private readonly stripeProvider: StripeProvider,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<StripeWebhookRequest>();
    const signatureHeader = request.headers['stripe-signature'];
    const signature = Array.isArray(signatureHeader)
      ? signatureHeader[0]
      : signatureHeader;
    const webhookSecret = this.config.get<string>('stripe.webhookSecret');

    if (!webhookSecret) {
      throw new ServiceUnavailableException(
        'Stripe webhook validation is not configured',
      );
    }
    if (!signature || !request.rawBody) {
      throw new UnauthorizedException('Missing Stripe signature');
    }

    try {
      // Attaches the verified event to the request so the controller/service
      // never re-parses (and can't be tricked into trusting) the raw body.
      (request as StripeWebhookRequest & { stripeEvent: unknown }).stripeEvent =
        this.stripeProvider.constructWebhookEvent(
          request.rawBody,
          signature,
          webhookSecret,
        );
    } catch {
      throw new UnauthorizedException('Invalid Stripe signature');
    }

    return true;
  }
}
