import { CalendarProviderType } from '../enums/calendar-provider.enum';
import { MeetingType } from '../enums/meeting-type.enum';
import { MeetingUrgency } from '../enums/meeting-urgency.enum';

export type CalendarEventInput = {
  title: string;
  description?: string;
  startsAt: Date;
  endsAt: Date;
  timezone: string;
  attendees: string[];
  meetingType?: MeetingType;
  urgency?: MeetingUrgency;
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

export type SyncedCalendarEvent = {
  id: string;
  title: string;
  description?: string;
  startsAt?: Date;
  endsAt?: Date;
  timezone?: string;
  attendees: string[];
  htmlUrl?: string;
  cancelled: boolean;
  providerUpdatedAt?: Date;
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
  listEvents(
    accessToken: string,
    range: { from: Date; to: Date },
  ): Promise<SyncedCalendarEvent[]>;
}
