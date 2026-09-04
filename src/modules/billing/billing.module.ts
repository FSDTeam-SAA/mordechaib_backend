import { Module } from '@nestjs/common';
import { InvoicesModule } from '../invoices/invoices.module';
import { StripeModule } from '../stripe/stripe.module';
import { OnboardingSetupsModule } from '../onboarding-setups/onboarding-setups.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { TwilioModule } from '../twilio/twilio.module';
import { BillingController } from './billing.controller';
import { BillingWebhookController } from './billing-webhook.controller';
import { BillingService } from './billing.service';
import { StripeSignatureGuard } from './guards/stripe-signature.guard';

@Module({
  imports: [
    StripeModule,
    SubscriptionsModule,
    InvoicesModule,
    OnboardingSetupsModule,
    TwilioModule,
  ],
  controllers: [BillingController, BillingWebhookController],
  providers: [BillingService, StripeSignatureGuard],
  exports: [BillingService],
})
export class BillingModule {}
