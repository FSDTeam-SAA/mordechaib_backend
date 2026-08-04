import {
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import Stripe from 'stripe';
import { Public } from '../../common/decorators/public.decorator';
import { StripeSignatureGuard } from './guards/stripe-signature.guard';
import { BillingService } from './billing.service';

type StripeEventRequest = { stripeEvent: Stripe.Event };

@Public()
@SkipThrottle()
@Controller('webhooks/billing')
@UseGuards(StripeSignatureGuard)
export class BillingWebhookController {
  constructor(private readonly billingService: BillingService) {}

  @Post('stripe')
  @HttpCode(HttpStatus.OK)
  handleStripeEvent(@Req() req: StripeEventRequest) {
    return this.billingService.handleStripeEvent(req.stripeEvent);
  }
}
