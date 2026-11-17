import { Module } from '@nestjs/common';
import { InvoicesModule } from '../invoices/invoices.module';
import { StripeModule } from '../stripe/stripe.module';
import { OnboardingSetupsModule } from '../onboarding-setups/onboarding-setups.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { TwilioModule } from '../twilio/twilio.module';
import { AddonsModule } from '../addons/addons.module';
import { UsageModule } from '../usage/usage.module';
import { BillingController } from './billing.controller';
import { BillingWebhookController } from './billing-webhook.controller';
import { BillingService } from './billing.service';
import { StripeSignatureGuard } from './guards/stripe-signature.guard';
import { UsageBillingRepository } from './usage-billing.repository';
import { UsageBillingService } from './usage-billing.service';

@Module({
  imports: [
    StripeModule,
    SubscriptionsModule,
    InvoicesModule,
    OnboardingSetupsModule,
    TwilioModule,
    AddonsModule,
    UsageModule,
  ],
  controllers: [BillingController, BillingWebhookController],
  providers: [
    BillingService,
    StripeSignatureGuard,
    UsageBillingRepository,
    UsageBillingService,
  ],
  exports: [BillingService, UsageBillingService],
})
export class BillingModule {}
