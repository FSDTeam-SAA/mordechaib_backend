import { Module } from '@nestjs/common';
import { CalendarController } from './calendar.controller';
import { CalendarService } from './calendar.service';
import { CalendarRepository } from './calendar.repository';
import { GoogleCalendarProvider } from './providers/google-calendar.provider';
import { OutlookCalendarProvider } from './providers/outlook-calendar.provider';

@Module({
  controllers: [CalendarController],
  providers: [
    CalendarService,
    CalendarRepository,
    GoogleCalendarProvider,
    OutlookCalendarProvider,
  ],
  exports: [CalendarService],
})
export class CalendarModule {}
