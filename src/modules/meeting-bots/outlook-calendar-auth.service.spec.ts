import { ConfigService } from '@nestjs/config';
import { decryptText } from '../../common/helpers/crypto.helper';
import { CalendarRepository } from '../calendar/calendar.repository';
import { OutlookCalendarProvider } from '../calendar/providers/outlook-calendar.provider';
import { MeetingOAuthStateService } from './meeting-oauth-state.service';
import { OutlookCalendarAuthService } from './outlook-calendar-auth.service';

describe('OutlookCalendarAuthService', () => {
  const encryptionKey = 'm'.repeat(32);
  const repository = {
    find: jest.fn(),
    upsert: jest.fn(),
    ensureDefault: jest.fn(),
    disconnect: jest.fn(),
  };
  const oauthState = { create: jest.fn(), consume: jest.fn() };
  const provider = {
    getAuthorizationUrl: jest.fn(),
    exchangeCode: jest.fn(),
    getProfile: jest.fn(),
  };
  const config = {
    getOrThrow: jest.fn().mockReturnValue(encryptionKey),
  };
  const service = new OutlookCalendarAuthService(
    repository as unknown as CalendarRepository,
    oauthState as unknown as MeetingOAuthStateService,
    provider as unknown as OutlookCalendarProvider,
    config as unknown as ConfigService,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    repository.find.mockResolvedValue(null);
    repository.upsert.mockResolvedValue({});
    oauthState.consume.mockResolvedValue({
      organizationId: 'org-1',
      userId: 'owner-1',
    });
    provider.exchangeCode.mockResolvedValue({
      access_token: 'plain-microsoft-access',
      refresh_token: 'plain-microsoft-refresh',
      expires_in: 3600,
      scope: 'User.Read Calendars.ReadWrite offline_access',
    });
    provider.getProfile.mockResolvedValue({
      id: 'microsoft-user-1',
      displayName: 'CEO',
      mail: 'ceo@example.com',
    });
  });

  it('encrypts tokens and makes the first connected calendar the default', async () => {
    await service.completeAuthorization('code', 'state');

    const saved = repository.upsert.mock.calls[0][2] as {
      accessToken: string;
      refreshToken: string;
    };
    expect(decryptText(saved.accessToken, encryptionKey)).toBe(
      'plain-microsoft-access',
    );
    expect(decryptText(saved.refreshToken, encryptionKey)).toBe(
      'plain-microsoft-refresh',
    );
    expect(repository.ensureDefault).toHaveBeenCalledWith('org-1');
  });
});
