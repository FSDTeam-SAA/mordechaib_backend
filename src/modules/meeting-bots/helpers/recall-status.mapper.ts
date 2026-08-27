import { MeetingBotStatus } from '../../../common/enums/meeting-bot-status.enum';

const FAILURE_MESSAGES: Record<string, string> = {
  google_meet_sign_in_missing_login_credentials:
    'This Google Meet requires a signed-in bot account',
  google_meet_knocking_disabled:
    'This Google Meet does not allow external participants to request entry',
  google_meet_login_not_available:
    'No Google Meet bot login is currently available',
  google_meet_sign_in_failed: 'The Google Meet bot could not sign in',
  google_meet_sso_sign_in_failed:
    'The Google Meet bot could not sign in through SSO',
  google_meet_bot_blocked: 'The Google Meet host or workspace blocked the bot',
  meeting_link_invalid: 'The meeting URL is invalid',
  meeting_link_expired: 'The meeting URL has expired',
  meeting_ended: 'The meeting has already ended',
  meeting_locked: 'The meeting is locked',
  meeting_full: 'The meeting is full',
};

export function mapRecallBotStatus(event: string) {
  const statuses: Record<string, MeetingBotStatus> = {
    'bot.joining_call': MeetingBotStatus.JOINING,
    'bot.in_waiting_room': MeetingBotStatus.WAITING_ROOM,
    'bot.in_call_not_recording': MeetingBotStatus.IN_CALL,
    'bot.recording_permission_allowed': MeetingBotStatus.IN_CALL,
    'bot.recording_permission_denied': MeetingBotStatus.IN_CALL,
    'bot.in_call_recording': MeetingBotStatus.RECORDING,
    'bot.call_ended': MeetingBotStatus.PROCESSING,
    'bot.done': MeetingBotStatus.PROCESSING,
    'bot.fatal': MeetingBotStatus.FAILED,
  };
  return statuses[event] || MeetingBotStatus.PROCESSING;
}

export function recallFailure(
  subCode?: string,
  providerMessage?: string,
  fallback = 'Recall meeting bot failed',
) {
  return {
    failureCode: subCode || 'RECALL_BOT_FAILED',
    failureMessage:
      (subCode ? FAILURE_MESSAGES[subCode] : undefined) ||
      providerMessage ||
      subCode ||
      fallback,
  };
}
