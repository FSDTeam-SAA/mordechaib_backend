import { Module } from '@nestjs/common';
import { RolesGuard } from '../../common/guards/roles.guard';
import { StripeModule } from '../stripe/stripe.module';
import { SetupPackagesModule } from '../setup-packages/setup-packages.module';
import { OnboardingSetupsController } from './onboarding-setups.controller';
import { OnboardingSetupsRepository } from './onboarding-setups.repository';
import { OnboardingSetupsService } from './onboarding-setups.service';

@Module({
  imports: [StripeModule, SetupPackagesModule],
  controllers: [OnboardingSetupsController],
  providers: [OnboardingSetupsService, OnboardingSetupsRepository, RolesGuard],
  exports: [OnboardingSetupsService],
})
export class OnboardingSetupsModule {}
