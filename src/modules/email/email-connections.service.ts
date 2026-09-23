import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import crypto from 'crypto';
import { isEmail } from 'class-validator';
import { Model } from 'mongoose';
import { EmailProvider } from '../../common/enums/email-provider.enum';
import { UserRole } from '../../common/enums/user-role.enum';
import { UserStatus } from '../../common/enums/user-status.enum';
import { decryptText, encryptText } from '../../common/helpers/crypto.helper';
import { User } from '../../database/schemas/user.schema';
import { EmailConnectionsRepository } from './email-connections.repository';
import { EmailProviderClient } from './email-provider.client';

@Injectable()
export class EmailConnectionsService {
  constructor(
    private readonly repository: EmailConnectionsRepository,
    private readonly providerClient: EmailProviderClient,
    private readonly config: ConfigService,
    @InjectModel(User.name) private readonly users: Model<User>,
  ) {}

  async connectUrl(
    organizationId: string,
    userId: string,
    provider: EmailProvider,
  ) {
    const state = crypto.randomBytes(32).toString('base64url');
    const authorizationUrl = this.providerClient.authorizationUrl(provider, state);
    await this.repository.createState({
      nonceHash: this.hash(state),
      provider,
      organizationId,
      userId,
      expiresAt: new Date(Date.now() + 10 * 60_000),
    });
    return { authorizationUrl };
  }

  async complete(provider: EmailProvider, code: string, state: string) {
    if (!code || !state || state.length > 200) {
      throw new BadRequestException('OAuth code and state are required');
    }
    const context = await this.repository.consumeState(
      this.hash(state),
      provider,
    );
    if (!context) {
      throw new UnauthorizedException(
        'Email OAuth state is invalid or expired',
      );
    }
    const owner = await this.users
      .findOne({
        _id: context.userId,
        organizationId: context.organizationId,
        role: UserRole.OWNER,
        status: UserStatus.ACTIVE,
      })
      .lean()
      .exec();
    if (!owner)
      throw new ForbiddenException('Account owner is no longer active');

    const tokens = await this.providerClient.exchangeCode(provider, code);
    const scopes = (tokens.scope || '').split(' ').filter(Boolean);
    const requiredScope =
      provider === EmailProvider.GOOGLE
        ? 'https://www.googleapis.com/auth/gmail.send'
        : 'Mail.Send';
    if (
      !scopes.some(
        (scope) => scope.toLowerCase() === requiredScope.toLowerCase(),
      )
    ) {
      throw new ForbiddenException('Email send permission was not granted');
    }
    const profile = await this.providerClient.profile(
      provider,
      tokens.access_token,
    );
    if (!isEmail(profile.email)) {
      throw new BadRequestException(
        'Connected email account has no valid address',
      );
    }
    const existing = await this.repository.find(
      context.organizationId,
      context.userId,
      provider,
    );
    const refreshToken =
      tokens.refresh_token ||
      (existing?.providerAccountId === profile.id && existing.refreshToken
        ? decryptText(existing.refreshToken, this.encryptionKey)
        : undefined);
    if (!refreshToken) {
      throw new BadRequestException(
        'No refresh token was granted; revoke the previous app grant and reconnect',
      );
    }
    await this.repository.upsert(
      context.organizationId,
      context.userId,
      provider,
      {
        status: 'CONNECTED',
        providerAccountId: profile.id,
        email: profile.email.toLowerCase(),
        scopes,
        accessToken: encryptText(tokens.access_token, this.encryptionKey),
        refreshToken: encryptText(refreshToken, this.encryptionKey),
        expiresAt: tokens.expires_in
          ? new Date(Date.now() + tokens.expires_in * 1000)
          : undefined,
      },
    );
    return { connected: true, provider, email: profile.email.toLowerCase() };
  }

  async list(organizationId: string, userId: string) {
    const connections = await this.repository.list(organizationId, userId);
    return Object.values(EmailProvider).map((provider) => {
      const connection = connections.find((item) => item.provider === provider);
      return {
        provider,
        connected: connection?.status === 'CONNECTED',
        email:
          connection?.status === 'CONNECTED' ? connection.email : undefined,
        expiresAt: connection?.expiresAt,
      };
    });
  }

  async disconnect(
    organizationId: string,
    userId: string,
    provider: EmailProvider,
  ) {
    await this.repository.disconnect(organizationId, userId, provider);
    return { provider, connected: false };
  }

  async accessToken(
    organizationId: string,
    userId: string,
    provider: EmailProvider,
  ) {
    const connection = await this.repository.find(
      organizationId,
      userId,
      provider,
    );
    if (!connection || connection.status !== 'CONNECTED') {
      throw new ServiceUnavailableException(
        'Connect this email account before sending',
      );
    }
    if (
      connection.accessToken &&
      connection.expiresAt &&
      new Date(connection.expiresAt).getTime() > Date.now() + 60_000
    ) {
      return {
        token: decryptText(connection.accessToken, this.encryptionKey),
        email: connection.email,
      };
    }
    if (!connection.refreshToken) {
      throw new ServiceUnavailableException(
        'Email account must be reconnected',
      );
    }
    const tokens = await this.providerClient.refreshToken(
      provider,
      decryptText(connection.refreshToken, this.encryptionKey),
    );
    const update = await this.repository.updateTokens(
      organizationId,
      userId,
      provider,
      {
        accessToken: encryptText(tokens.access_token, this.encryptionKey),
        ...(tokens.refresh_token
          ? {
              refreshToken: encryptText(
                tokens.refresh_token,
                this.encryptionKey,
              ),
            }
          : {}),
        expiresAt: tokens.expires_in
          ? new Date(Date.now() + tokens.expires_in * 1000)
          : undefined,
      },
    );
    if (!update.matchedCount) {
      throw new ServiceUnavailableException(
        'Email account was disconnected; reconnect before sending',
      );
    }
    return { token: tokens.access_token, email: connection.email };
  }

  callbackUrl(provider: EmailProvider, connected: boolean, error?: string) {
    const url = new URL(
      this.config.get<string>(
        'email.frontendIntegrationsUrl',
        'http://localhost:3000/dashboard/integrations',
      ),
    );
    url.searchParams.set(
      'provider',
      provider === EmailProvider.GOOGLE ? 'gmail' : 'outlook-email',
    );
    url.searchParams.set('connection', connected ? 'success' : 'failed');
    if (error) url.searchParams.set('error', error.slice(0, 120));
    return url.toString();
  }

  private hash(value: string) {
    return crypto.createHash('sha256').update(value).digest('hex');
  }

  private get encryptionKey() {
    const key = this.config.getOrThrow<string>('integrations.encryptionKey');
    if (key.length < 32) {
      throw new ServiceUnavailableException(
        'Email encryption is not configured',
      );
    }
    return key;
  }
}
