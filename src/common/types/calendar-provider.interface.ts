import { CalendarProviderType } from '../enums/calendar-provider.enum';

export type CalendarEventInput = {
  title: string;
  description?: string;
  startsAt: Date;
  endsAt: Date;
  timezone: string;
  attendees: string[];
  meetingUrl?: string;
  reminderMinutesBeforeStart: number;
};

export type CreateCalendarEventInput = CalendarEventInput;

export type UpdateCalendarEventInput = Partial<CalendarEventInput>;

export type CalendarEventResult = {
  id: string;
  provider: CalendarProviderType;
  htmlUrl?: string;
};

export interface CalendarProvider {
  readonly provider: CalendarProviderType;
  refreshAccessToken(refreshToken: string): Promise<{
    access_token?: string;
    expires_in?: number;
    refresh_token?: string;
  }>;
  createEvent(
    accessToken: string,
    input: CreateCalendarEventInput,
  ): Promise<CalendarEventResult>;
  updateEvent(
    accessToken: string,
    eventId: string,
    input: UpdateCalendarEventInput,
  ): Promise<CalendarEventResult>;
  cancelEvent(accessToken: string, eventId: string): Promise<void>;
}
