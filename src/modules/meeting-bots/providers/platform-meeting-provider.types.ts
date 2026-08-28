export type CreateProviderMeetingInput = {
  title: string;
  agenda?: string;
  startsAt: Date;
  durationMinutes: number;
  timezone: string;
  invitees: string[];
  immediate: boolean;
};

export type CreatedProviderMeeting = {
  providerMeetingId: string;
  joinUrl: string;
  startUrl?: string;
  metadata?: Record<string, unknown>;
};
