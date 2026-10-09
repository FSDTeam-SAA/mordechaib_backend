export type TwilioTranscriptionWebhookDto = {
  AccountSid?: string;
  CallSid?: string;
  TranscriptionSid?: string;
  TranscriptionEvent?: string;
  TranscriptionData?: string;
  SequenceId?: string;
  Track?: string;
  LanguageCode?: string;
  Timestamp?: string;
  Final?: string;
  TranscriptionErrorCode?: string;
  TranscriptionError?: string;
  // Kept for backwards compatibility with manually generated test payloads.
  ErrorCode?: string;
  ErrorMessage?: string;
};
