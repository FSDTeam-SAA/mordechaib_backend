import { Injectable } from '@nestjs/common';
import {
  CalendarProvider,
  CreateCalendarEventInput,
} from '../interfaces/calendar-provider.interface';

@Injectable()
export class GoogleCalendarProvider implements CalendarProvider {
  checkAvailability(input: Record<string, unknown>) {
    return Promise.resolve({
      provider: 'google-calendar',
      available: true,
      input,
    });
  }
  createEvent(input: CreateCalendarEventInput) {
    return Promise.resolve({
      provider: 'google-calendar',
      action: 'createEvent',
      input,
    });
  }
  updateEvent(eventId: string, input: Record<string, unknown>) {
    return Promise.resolve({ provider: 'google-calendar', eventId, input });
  }
  cancelEvent(eventId: string) {
    return Promise.resolve({
      provider: 'google-calendar',
      eventId,
      cancelled: true,
    });
  }
}
