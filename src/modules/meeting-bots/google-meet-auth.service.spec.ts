import { ConfigService } from '@nestjs/config';
import { decryptText } from '../../common/helpers/crypto.helper';
import { GoogleMeetAuthService } from './google-meet-auth.service';
import { MeetingOAuthStateService } from './meeting-oauth-state.service';
import { MeetingPlatformConnectionsRepository } from './meeting-platform-connections.repository';
import { GoogleMeetProvider } from './providers/google-meet.provider';
import { CalendarRepository } from '../calendar/calendar.repository';

describe('GoogleMeetAuthService', () => {
  const encryptionKey = 'g'.repeat(32);
  const repository = {
    find: jest.fn(),
    upsert: jest.fn(),
    disconnect: jest.fn(),
  };
  const oauthState = {
    consume: jest.fn(),
  };
  const provider = {
    exchangeCode: jest.fn(),
    getProfile: jest.fn(),
    revokeToken: jest.fn(),
  };
  const config = {
    getOrThrow: jest.fn().mockReturnValue(encryptionKey),
  };
  const calendarRepository = {
    ensureDefault: jest.fn(),
    disconnect: jest.fn(),
  };
  const service = new GoogleMeetAuthService(
    repository as unknown as MeetingPlatformConnectionsRepository,
    oauthState as unknown as MeetingOAuthStateService,
    provider as unknown as GoogleMeetProvider,
    config as unknown as ConfigService,
    calendarRepository as unknown as CalendarRepository,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    repository.find.mockResolvedValue(null);
    repository.upsert.mockResolvedValue({});
    oauthState.consume.mockResolvedValue({
      organizationId: 'org-1',
      userId: 'user-1',
    });
    provider.exchangeCode.mockResolvedValue({
      access_token: 'plain-access-token',
      refresh_token: 'plain-refresh-token',
      expires_in: 3600,
      scope: 'openid email',
    });
    provider.getProfile.mockResolvedValue({
      sub: 'google-user-1',
      email: 'organizer@example.com',
      name: 'Organizer',
    });
  });

  it('stores organization Google tokens encrypted', async () => {
    await service.completeAuthorization('google-code', 'signed-state');

    const saved = repository.upsert.mock.calls[0][2] as {
      accessToken: string;
      refreshToken: string;
      metadata: Record<string, unknown>;
    };
    expect(repository.upsert.mock.calls[0][0]).toBe('org-1');
    expect(saved.accessToken).not.toContain('plain-access-token');
    expect(saved.refreshToken).not.toContain('plain-refresh-token');
    expect(decryptText(saved.accessToken, encryptionKey)).toBe(
      'plain-access-token',
    );
    expect(decryptText(saved.refreshToken, encryptionKey)).toBe(
      'plain-refresh-token',
    );
    expect(saved.metadata).toEqual(
      expect.objectContaining({
        connectedByUserId: 'user-1',
        providerEmail: 'organizer@example.com',
      }),
    );
    expect(calendarRepository.ensureDefault).toHaveBeenCalledWith('org-1');
  });

  it('continues local disconnect when a token was encrypted with an old key', async () => {
    repository.find.mockResolvedValue({
      status: 'CONNECTED',
      refreshToken: 'token-encrypted-with-an-old-key',
    });

    await expect(service.disconnect('org-1')).resolves.toEqual({
      connected: false,
      disconnected: true,
    });

    expect(provider.revokeToken).not.toHaveBeenCalled();
    expect(repository.disconnect).toHaveBeenCalledWith('org-1', 'GOOGLE_MEET');
    expect(calendarRepository.disconnect).toHaveBeenCalledWith(
      'org-1',
      'GOOGLE_CALENDAR',
    );
  });
});
