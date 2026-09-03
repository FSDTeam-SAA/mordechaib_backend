import { Module } from '@nestjs/common';
import { CalendarController } from './calendar.controller';
import { CalendarService } from './calendar.service';
import { CalendarRepository } from './calendar.repository';
import { GoogleCalendarProvider } from './providers/google-calendar.provider';
import { OutlookCalendarProvider } from './providers/outlook-calendar.provider';
import { ConfigModule } from '@nestjs/config';
import { CalendarEventsRepository } from './calendar-events.repository';

@Module({
  imports: [ConfigModule],
  controllers: [CalendarController],
  providers: [
    CalendarService,
    CalendarRepository,
    GoogleCalendarProvider,
    OutlookCalendarProvider,
    CalendarEventsRepository,
  ],
  exports: [
    CalendarService,
    CalendarRepository,
    GoogleCalendarProvider,
    OutlookCalendarProvider,
  ],
})
export class CalendarModule {}
