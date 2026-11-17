import { Module } from '@nestjs/common';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { UsageController } from './usage.controller';
import { UsageService } from './usage.service';
import { UsageRepository } from './usage.repository';

@Module({
  imports: [SubscriptionsModule],
  controllers: [UsageController],
  providers: [UsageService, UsageRepository],
  exports: [UsageService, UsageRepository],
})
export class UsageModule {}
