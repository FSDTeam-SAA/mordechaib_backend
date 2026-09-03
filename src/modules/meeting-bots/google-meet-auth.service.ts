import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MeetingPlatform } from '../../common/enums/meeting-platform.enum';
import { decryptText, encryptText } from '../../common/helpers/crypto.helper';
import { MeetingOAuthStateService } from './meeting-oauth-state.service';
import {
  MeetingConnectionMetadata,
  MeetingPlatformConnectionsRepository,
} from './meeting-platform-connections.repository';
import { GoogleMeetProvider } from './providers/google-meet.provider';
import { CalendarRepository } from '../calendar/calendar.repository';
import { CalendarProviderType } from '../../common/enums/calendar-provider.enum';

@Injectable()
export class GoogleMeetAuthService {
  private readonly logger = new Logger(GoogleMeetAuthService.name);

  constructor(
    private readonly repository: MeetingPlatformConnectionsRepository,
    private readonly oauthState: MeetingOAuthStateService,
    private readonly provider: GoogleMeetProvider,
    private readonly config: ConfigService,
    private readonly calendarRepository: CalendarRepository,
  ) {}

  async createAuthorizationUrl(organizationId: string, userId: string) {
    const state = await this.oauthState.create(
      MeetingPlatform.GOOGLE_MEET,
      organizationId,
      userId,
    );
    return { authorizationUrl: this.provider.getAuthorizationUrl(state) };
  }

  async completeAuthorization(code: string, state: string) {
    const context = await this.oauthState.consume(
      state,
      MeetingPlatform.GOOGLE_MEET,
    );
    const existing = await this.repository.find(
      context.organizationId,
      MeetingPlatform.GOOGLE_MEET,
    );
    const tokens = await this.provider.exchangeCode(code);
    let refreshToken = tokens.refresh_token;
    if (!refreshToken && existing?.refreshToken) {
      refreshToken = decryptText(existing.refreshToken, this.encryptionKey);
    }
    if (!refreshToken) {
      throw new BadRequestException(
        'Google did not return a refresh token; revoke the previous app grant and reconnect',
      );
    }
    const profile = await this.provider.getProfile(tokens.access_token!);
    await this.repository.upsert(
      context.organizationId,
      MeetingPlatform.GOOGLE_MEET,
      {
        status: 'CONNECTED',
        accessToken: encryptText(tokens.access_token!, this.encryptionKey),
        refreshToken: encryptText(refreshToken, this.encryptionKey),
        expiresAt: tokens.expires_in
          ? new Date(Date.now() + tokens.expires_in * 1000)
          : undefined,
        metadata: {
          connectedByUserId: context.userId,
          providerAccountId: profile.sub,
          providerEmail: profile.email,
          providerName: profile.name,
          scopes: tokens.scope?.split(' ').filter(Boolean),
        } satisfies MeetingConnectionMetadata,
      },
    );
    await this.calendarRepository.ensureDefault(context.organizationId);
    return { connected: true, organizationId: context.organizationId };
  }

  async getConnection(organizationId: string) {
    const connection = await this.repository.find(
      organizationId,
      MeetingPlatform.GOOGLE_MEET,
    );
    if (!connection) return { connected: false };
    const metadata = connection.metadata as
      MeetingConnectionMetadata | undefined;
    return {
      connected: connection.status === 'CONNECTED',
      status: connection.status,
      provider: 'GOOGLE_MEET',
      account: {
        id: metadata?.providerAccountId,
        email: metadata?.providerEmail,
        name: metadata?.providerName,
      },
      connectedByUserId: metadata?.connectedByUserId,
      expiresAt: connection.expiresAt,
    };
  }

  async disconnect(organizationId: string) {
    const connection = await this.repository.find(
      organizationId,
      MeetingPlatform.GOOGLE_MEET,
    );
    if (!connection) return { connected: false };
    const encryptedToken = connection.refreshToken || connection.accessToken;
    if (encryptedToken) {
      try {
        const token = decryptText(encryptedToken, this.encryptionKey);
        await this.provider.revokeToken(token).catch(() => undefined);
      } catch {
        this.logger.warn(
          `Stored Google token for organization ${organizationId} could not be decrypted; continuing local disconnect`,
        );
      }
    }
    await this.repository.disconnect(
      organizationId,
      MeetingPlatform.GOOGLE_MEET,
    );
    await this.calendarRepository.disconnect(
      organizationId,
      CalendarProviderType.GOOGLE_CALENDAR,
    );
    return { connected: false, disconnected: true };
  }

  async getAccessToken(organizationId: string) {
    const connection = await this.repository.findConnected(
      organizationId,
      MeetingPlatform.GOOGLE_MEET,
    );
    if (!connection) {
      throw new ServiceUnavailableException(
        'The organization Google account is not connected',
      );
    }
    if (
      connection.accessToken &&
      (!connection.expiresAt ||
        new Date(connection.expiresAt).getTime() > Date.now() + 60_000)
    ) {
      return decryptText(connection.accessToken, this.encryptionKey);
    }
    if (!connection.refreshToken) {
      throw new ServiceUnavailableException(
        'The Google connection must be reauthorized',
      );
    }
    const tokens = await this.provider.refreshAccessToken(
      decryptText(connection.refreshToken, this.encryptionKey),
    );
    await this.repository.upsert(organizationId, MeetingPlatform.GOOGLE_MEET, {
      status: 'CONNECTED',
      accessToken: encryptText(tokens.access_token!, this.encryptionKey),
      expiresAt: tokens.expires_in
        ? new Date(Date.now() + tokens.expires_in * 1000)
        : undefined,
    });
    return tokens.access_token!;
  }

  callbackUrl(connected: boolean, error?: string) {
    return this.oauthState.callbackUrl(
      MeetingPlatform.GOOGLE_MEET,
      connected,
      error,
    );
  }

  private get encryptionKey() {
    const key = this.config.getOrThrow<string>('integrations.encryptionKey');
    if (key.length < 32) {
      throw new BadRequestException(
        'INTEGRATION_ENCRYPTION_KEY must contain at least 32 characters',
      );
    }
    return key;
  }
}
