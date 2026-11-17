import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { SubscriptionAccessGuard } from '../../common/guards/subscription-access.guard';
import { AddonsModule } from '../addons/addons.module';
import { AuthModule } from '../auth/auth.module';
import { OrganizationsModule } from '../organizations/organizations.module';
import { PackageInquiriesModule } from '../package-inquiries/package-inquiries.module';
import { StripeModule } from '../stripe/stripe.module';
import { CancellationRequestsRepository } from './cancellation-requests.repository';
import { CancellationSchedulerService } from './cancellation-scheduler.service';
import { CancellationsService } from './cancellations.service';
import { SubscriptionAnalyticsController } from './subscription-analytics.controller';
import { SubscriptionAnalyticsRepository } from './subscription-analytics.repository';
import { SubscriptionAnalyticsService } from './subscription-analytics.service';
import { SubscriptionPlansController } from './subscription-plans.controller';
import { SubscriptionPlansRepository } from './subscription-plans.repository';
import { SubscriptionPlansService } from './subscription-plans.service';
import { SubscriptionsAdminController } from './subscriptions-admin.controller';
import { SubscriptionsController } from './subscriptions.controller';
import { SubscriptionsRepository } from './subscriptions.repository';
import { SubscriptionsService } from './subscriptions.service';
import { SubscriptionAccessPolicyService } from './subscription-access-policy.service';

@Module({
  imports: [
    OrganizationsModule,
    StripeModule,
    AuthModule,
    PackageInquiriesModule,
    AddonsModule,
  ],
  controllers: [
    SubscriptionPlansController,
    SubscriptionsController,
    SubscriptionsAdminController,
    SubscriptionAnalyticsController,
  ],
  providers: [
    SubscriptionPlansService,
    SubscriptionPlansRepository,
    SubscriptionsService,
    SubscriptionsRepository,
    SubscriptionAccessPolicyService,
    {
      provide: APP_GUARD,
      useClass: SubscriptionAccessGuard,
    },
    SubscriptionAnalyticsService,
    SubscriptionAnalyticsRepository,
    CancellationsService,
    CancellationRequestsRepository,
    CancellationSchedulerService,
  ],
  exports: [
    SubscriptionPlansService,
    SubscriptionsService,
    SubscriptionAccessPolicyService,
  ],
})
export class SubscriptionsModule {}
