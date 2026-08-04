import { Module } from '@nestjs/common';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { BillingController } from './billing.controller';
import { BillingWebhookController } from './billing-webhook.controller';
import { BillingService } from './billing.service';
import { StripeProvider } from './providers/stripe.provider';
import { StripeSignatureGuard } from './guards/stripe-signature.guard';

@Module({
  imports: [SubscriptionsModule],
  controllers: [BillingController, BillingWebhookController],
  providers: [BillingService, StripeProvider, StripeSignatureGuard],
  exports: [BillingService],
})

export class BillingModule {}
