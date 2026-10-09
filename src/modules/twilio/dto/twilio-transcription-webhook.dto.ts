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
  ErrorCode?: string;
  ErrorMessage?: string;
};
