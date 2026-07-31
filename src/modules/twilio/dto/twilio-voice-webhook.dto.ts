export type TwilioVoiceWebhookDto = {
  AccountSid: string;
  CallSid: string;
  From: string;
  To: string;
  CallStatus?: string;
  [key: string]: string | undefined;
};
