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

@Module({
  imports: [ConfigModule, SettingsModule],
  controllers: [CalendarController, CalendarConnectionsController],
  providers: [
    CalendarService,
    CalendarRepository,
    GoogleCalendarProvider,
    OutlookCalendarProvider,
    CalendarEventsRepository,
    CalendarDashboardRepository,
    CalendarDashboardService,
  ],
  exports: [
    CalendarService,
    CalendarRepository,
    GoogleCalendarProvider,
    OutlookCalendarProvider,
  ],
})
export class CalendarModule {}
