import { Injectable } from '@nestjs/common';
import { GoogleCalendarProvider } from './providers/google-calendar.provider';
import { OutlookCalendarProvider } from './providers/outlook-calendar.provider';
import {
  CalendarProvider,
  CreateCalendarEventInput,
} from './interfaces/calendar-provider.interface';
import { CalendarRepository } from './calendar.repository';

@Injectable()
export class CalendarService {
  constructor(
    private readonly repository: CalendarRepository,
    private readonly google: GoogleCalendarProvider,
    private readonly outlook: OutlookCalendarProvider,
  ) {}

  async createEvent(organizationId: string, input: CreateCalendarEventInput) {
    const provider = await this.resolveProvider(organizationId);
    return provider.createEvent(input);
  }

  private async resolveProvider(
    organizationId: string,
  ): Promise<CalendarProvider> {
    const integration =
      await this.repository.findConnectedCalendar(organizationId);
    if (integration?.provider === 'OUTLOOK_CALENDAR') return this.outlook;
    return this.google;
  }
}
