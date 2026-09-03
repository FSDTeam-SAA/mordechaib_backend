export type CreateProviderMeetingInput = {
  title: string;
  agenda?: string;
  startsAt: Date;
  durationMinutes: number;
  timezone: string;
  invitees: string[];
  immediate: boolean;
  reminderMinutesBeforeStart: number;
};

export type UpdateProviderMeetingInput = {
  title: string;
  agenda?: string;
  startsAt: Date;
  durationMinutes: number;
  timezone: string;
  invitees: string[];
  reminderMinutesBeforeStart: number;
};

export type CreatedProviderMeeting = {
  providerMeetingId: string;
  joinUrl: string;
  startUrl?: string;
  metadata?: Record<string, unknown>;
};
