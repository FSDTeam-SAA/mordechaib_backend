import { ConfigService } from '@nestjs/config';
import { decryptText } from '../../common/helpers/crypto.helper';
import { GoogleMeetAuthService } from './google-meet-auth.service';
import { MeetingOAuthStateService } from './meeting-oauth-state.service';
import { MeetingPlatformConnectionsRepository } from './meeting-platform-connections.repository';
import { GoogleMeetProvider } from './providers/google-meet.provider';

describe('GoogleMeetAuthService', () => {
  const encryptionKey = 'g'.repeat(32);
  const repository = {
    find: jest.fn(),
    upsert: jest.fn(),
  };
  const oauthState = {
    consume: jest.fn(),
  };
  const provider = {
    exchangeCode: jest.fn(),
    getProfile: jest.fn(),
  };
  const config = {
    getOrThrow: jest.fn().mockReturnValue(encryptionKey),
  };
  const service = new GoogleMeetAuthService(
    repository as unknown as MeetingPlatformConnectionsRepository,
    oauthState as unknown as MeetingOAuthStateService,
    provider as unknown as GoogleMeetProvider,
    config as unknown as ConfigService,
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
  });
});
