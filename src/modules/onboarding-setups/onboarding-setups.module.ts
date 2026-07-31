import { Module } from '@nestjs/common';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CalendarModule } from '../calendar/calendar.module';
import { OnboardingSetupsController } from './onboarding-setups.controller';
import { OnboardingSetupsRepository } from './onboarding-setups.repository';
import { OnboardingSetupsService } from './onboarding-setups.service';

@Module({
  imports: [CalendarModule],
  controllers: [OnboardingSetupsController],
  providers: [OnboardingSetupsService, OnboardingSetupsRepository, RolesGuard],
  exports: [OnboardingSetupsService],
})
export class OnboardingSetupsModule {}