import { Injectable } from '@nestjs/common';
import {
  CalendarProvider,
  CreateCalendarEventInput,
} from '../../../common/types/calendar-provider.interface';

@Injectable()
export class OutlookCalendarProvider implements CalendarProvider {
  checkAvailability(input: Record<string, unknown>) {
    return Promise.resolve({
      provider: 'outlook-calendar',
      available: true,
      input,
    });
  }
  createEvent(input: CreateCalendarEventInput) {
    return Promise.resolve({
      provider: 'outlook-calendar',
      action: 'createEvent',
      input,
    });
  }
  updateEvent(eventId: string, input: Record<string, unknown>) {
    return Promise.resolve({ provider: 'outlook-calendar', eventId, input });
  }
  cancelEvent(eventId: string) {
    return Promise.resolve({
      provider: 'outlook-calendar',
      eventId,
      cancelled: true,
    });
  }
}
