import { Module } from '@nestjs/common';
import { SubscriptionAnalyticsController } from './subscription-analytics.controller';
import { SubscriptionAnalyticsRepository } from './subscription-analytics.repository';
import { SubscriptionAnalyticsService } from './subscription-analytics.service';
import { SubscriptionPlansController } from './subscription-plans.controller';
import { SubscriptionPlansRepository } from './subscription-plans.repository';
import { SubscriptionPlansService } from './subscription-plans.service';
import { SubscriptionsController } from './subscriptions.controller';
import { SubscriptionsRepository } from './subscriptions.repository';
import { SubscriptionsService } from './subscriptions.service';

@Module({
  controllers: [
    SubscriptionPlansController,
    SubscriptionsController,
    SubscriptionAnalyticsController,
  ],
  providers: [
    SubscriptionPlansService,
    SubscriptionPlansRepository,
    SubscriptionsService,
    SubscriptionsRepository,
    SubscriptionAnalyticsService,
    SubscriptionAnalyticsRepository,
  ],
  exports: [SubscriptionPlansService, SubscriptionsService],
})

export class SubscriptionsModule {}