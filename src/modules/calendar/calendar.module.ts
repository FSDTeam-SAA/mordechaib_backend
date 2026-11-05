import { Module } from '@nestjs/common';
import { CalendarController } from './calendar.controller';
import { CalendarConnectionsController } from './calendar-connections.controller';
import { CalendarService } from './calendar.service';
import { CalendarRepository } from './calendar.repository';
import { GoogleCalendarProvider } from './providers/google-calendar.provider';
import { OutlookCalendarProvider } from './providers/outlook-calendar.provider';
import { ConfigModule } from '@nestjs/config';
import { CalendarEventsRepository } from './calendar-events.repository';
import { SettingsModule } from '../settings/settings.module';
import { CalendarDashboardRepository } from './calendar-dashboard.repository';
import { CalendarDashboardService } from './calendar-dashboard.service';
import { CalendarPriorityService } from './calendar-priority.service';
import { CalendarSchedulingService } from './calendar-scheduling.service';
import { OrganizationsModule } from '../organizations/organizations.module';
import { CalendarTravelTimeService } from './calendar-travel-time.service';
import { CalendarFollowUpsService } from './calendar-follow-ups.service';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { SourceAnalysesModule } from '../source-analyses/source-analyses.module';

@Module({
  imports: [
    ConfigModule,
    SettingsModule,
    OrganizationsModule,
    AuditLogsModule,
    SourceAnalysesModule,
  ],
  controllers: [CalendarController, CalendarConnectionsController],
  providers: [
    CalendarService,
    CalendarRepository,
    GoogleCalendarProvider,
    OutlookCalendarProvider,
    CalendarEventsRepository,
    CalendarDashboardRepository,
    CalendarDashboardService,
    CalendarPriorityService,
    CalendarSchedulingService,
    CalendarTravelTimeService,
    CalendarFollowUpsService,
  ],
  exports: [
    CalendarService,
    CalendarRepository,
    GoogleCalendarProvider,
    OutlookCalendarProvider,
  ],
})
export class CalendarModule {}
