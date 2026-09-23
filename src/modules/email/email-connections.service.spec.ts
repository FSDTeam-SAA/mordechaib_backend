import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Model } from 'mongoose';
import { EmailProvider } from '../../common/enums/email-provider.enum';
import { encryptText } from '../../common/helpers/crypto.helper';
import { User } from '../../database/schemas/user.schema';
import { EmailConnectionsRepository } from './email-connections.repository';
import { EmailConnectionsService } from './email-connections.service';
import { EmailProviderClient } from './email-provider.client';

describe('EmailConnectionsService owner consent', () => {
  const encryptionKey = 'a'.repeat(32);
  let repository: Record<string, jest.Mock>;
  let provider: Record<string, jest.Mock>;
  let users: { findOne: jest.Mock };
  let service: EmailConnectionsService;

  beforeEach(() => {
    repository = {
      consumeState: jest
        .fn()
        .mockResolvedValue({ organizationId: 'org-1', userId: 'owner-1' }),
      find: jest.fn().mockResolvedValue(null),
      upsert: jest.fn().mockResolvedValue({}),
      updateTokens: jest.fn().mockResolvedValue({ matchedCount: 1 }),
    };
    provider = {
      exchangeCode: jest.fn().mockResolvedValue({
        access_token: 'access-token',
        refresh_token: 'refresh-token',
        scope: 'openid email https://www.googleapis.com/auth/gmail.send',
      }),
      profile: jest
        .fn()
        .mockResolvedValue({
          id: 'google-account-1',
          email: 'owner@example.com',
        }),
      refreshToken: jest
        .fn()
        .mockResolvedValue({ access_token: 'new-token', expires_in: 3600 }),
    };
    users = {
      findOne: jest
        .fn()
        .mockReturnValue({
          lean: () => ({ exec: async () => ({ _id: 'owner-1' }) }),
        }),
    };
    const config = {
      getOrThrow: jest.fn().mockReturnValue(encryptionKey),
    };
    service = new EmailConnectionsService(
      repository as unknown as EmailConnectionsRepository,
      provider as unknown as EmailProviderClient,
      config as unknown as ConfigService,
      users as unknown as Model<User>,
    );
  });

  it('rejects an invalid or reused OAuth state before exchanging the code', async () => {
    repository.consumeState.mockResolvedValue(null);
    await expect(
      service.complete(EmailProvider.GOOGLE, 'code', 'state'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(provider.exchangeCode).not.toHaveBeenCalled();
  });

  it('requires explicit mail-send consent before storing tokens', async () => {
    provider.exchangeCode.mockResolvedValue({
      access_token: 'access-token',
      refresh_token: 'refresh-token',
      scope: 'openid email profile',
    });
    await expect(
      service.complete(EmailProvider.GOOGLE, 'code', 'state'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(repository.upsert).not.toHaveBeenCalled();
  });

  it('stores consented tokens encrypted', async () => {
    await expect(
      service.complete(EmailProvider.GOOGLE, 'code', 'state'),
    ).resolves.toEqual({
      connected: true,
      provider: EmailProvider.GOOGLE,
      email: 'owner@example.com',
    });
    const saved = repository.upsert.mock.calls[0][3];
    expect(saved.accessToken).not.toContain('access-token');
    expect(saved.refreshToken).not.toContain('refresh-token');
  });

  it('does not use a connection disconnected during token refresh', async () => {
    repository.find.mockResolvedValue({
      status: 'CONNECTED',
      email: 'owner@example.com',
      refreshToken: encryptText('refresh-token', encryptionKey),
    });
    repository.updateTokens.mockResolvedValue({ matchedCount: 0 });
    await expect(
      service.accessToken('org-1', 'owner-1', EmailProvider.GOOGLE),
    ).rejects.toThrow('disconnected');
  });
});
