import { MeetingPlatform } from '../../../common/enums/meeting-platform.enum';
import { RecallApiClient } from './recall-api.client';
import { RecallMeetingProvider } from './recall-meeting.provider';

describe('RecallMeetingProvider', () => {
  const request = jest.fn().mockResolvedValue({ id: 'bot-1' });
  const provider = new RecallMeetingProvider({
    request,
  } as unknown as RecallApiClient);

  beforeEach(() => request.mockClear());

  it('sends Google Meet login configuration only for Google Meet', async () => {
    await provider.createBot({
      platform: MeetingPlatform.GOOGLE_MEET,
      meetingUrl: 'https://meet.google.com/abc-defg-hij',
      botName: 'Noltra AI',
      retentionHours: 168,
      consentMessage: 'Recording notice',
      googleMeetLoginGroupId: 'login-group-1',
      zoomZakUrl: 'https://backend.example/zoom-zak',
      metadata: { meeting_bot_id: 'meeting-1' },
    });

    const init = request.mock.calls[0][1] as RequestInit;
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(body.google_meet).toEqual({
      google_login_group_id: 'login-group-1',
    });
    expect(body).not.toHaveProperty('zoom');
  });

  it('sends ZAK configuration only for Zoom', async () => {
    await provider.createBot({
      platform: MeetingPlatform.ZOOM,
      meetingUrl: 'https://zoom.us/j/123456789',
      botName: 'Noltra AI',
      retentionHours: 168,
      consentMessage: 'Recording notice',
      zoomZakUrl: 'https://backend.example/zoom-zak',
      googleMeetLoginGroupId: 'login-group-1',
      metadata: { meeting_bot_id: 'meeting-1' },
    });

    const init = request.mock.calls[0][1] as RequestInit;
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(body.zoom).toEqual({
      zak_url: 'https://backend.example/zoom-zak',
    });
    expect(body).not.toHaveProperty('google_meet');
  });
});
