import { MeetingBotStatus } from '../../../common/enums/meeting-bot-status.enum';
import { mapRecallBotStatus, recallFailure } from './recall-status.mapper';

describe('Recall status mapper', () => {
  it('maps Google Meet waiting-room lifecycle events', () => {
    expect(mapRecallBotStatus('bot.in_waiting_room')).toBe(
      MeetingBotStatus.WAITING_ROOM,
    );
  });

  it('maps fatal Google Meet subcodes to safe user-facing messages', () => {
    expect(
      recallFailure('google_meet_knocking_disabled', 'provider detail'),
    ).toEqual({
      failureCode: 'google_meet_knocking_disabled',
      failureMessage:
        'This Google Meet does not allow external participants to request entry',
    });
  });

  it('preserves a provider message for unknown subcodes', () => {
    expect(recallFailure('unknown_code', 'Provider failed')).toEqual({
      failureCode: 'unknown_code',
      failureMessage: 'Provider failed',
    });
  });
});
