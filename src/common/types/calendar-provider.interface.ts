export type CreateCalendarEventInput = {
  title: string;
  startTime: string;
  endTime: string;
  attendees?: string[];
};

export interface CalendarProvider {
  checkAvailability(input: Record<string, unknown>): Promise<unknown>;
  createEvent(input: CreateCalendarEventInput): Promise<unknown>;
  updateEvent(
    eventId: string,
    input: Record<string, unknown>,
  ): Promise<unknown>;
  cancelEvent(eventId: string): Promise<unknown>;
}