import { Module } from '@nestjs/common';
import { InvoicesModule } from '../invoices/invoices.module';
import { StripeModule } from '../stripe/stripe.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { BillingController } from './billing.controller';
import { BillingWebhookController } from './billing-webhook.controller';
import { BillingService } from './billing.service';
import { StripeSignatureGuard } from './guards/stripe-signature.guard';

@Module({
  imports: [StripeModule, SubscriptionsModule, InvoicesModule],
  controllers: [BillingController, BillingWebhookController],
  providers: [BillingService, StripeSignatureGuard],
  exports: [BillingService],
})

export class BillingModule {}