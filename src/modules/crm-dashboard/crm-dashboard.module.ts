import { Module } from '@nestjs/common';
import { OrganizerDashboardModule } from '../organizer-dashboard/organizer-dashboard.module';
import { CrmDashboardController } from './crm-dashboard.controller';
import { CrmDashboardService } from './crm-dashboard.service';

@Module({
  imports: [OrganizerDashboardModule],
  controllers: [CrmDashboardController],
  providers: [CrmDashboardService],
})
export class CrmDashboardModule {}
