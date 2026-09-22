import { Module } from '@nestjs/common';
import { RolesGuard } from '../../common/guards/roles.guard';
import { StripeModule } from '../stripe/stripe.module';
import { SetupPackagesModule } from '../setup-packages/setup-packages.module';
import { OnboardingSetupsController } from './onboarding-setups.controller';
import { OnboardingSetupsRepository } from './onboarding-setups.repository';
import { OnboardingSetupsService } from './onboarding-setups.service';
import { OnboardingAvailabilityRepository } from './onboarding-availability.repository';
import { OnboardingAvailabilityService } from './onboarding-availability.service';

@Module({
  imports: [StripeModule, SetupPackagesModule],
  controllers: [OnboardingSetupsController],
  providers: [
    OnboardingSetupsService,
    OnboardingSetupsRepository,
    OnboardingAvailabilityService,
    OnboardingAvailabilityRepository,
    RolesGuard,
  ],
  exports: [OnboardingSetupsService],
})
export class OnboardingSetupsModule {}
