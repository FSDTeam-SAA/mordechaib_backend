import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CalendarProviderType } from '../../common/enums/calendar-provider.enum';
import { decryptText, encryptText } from '../../common/helpers/crypto.helper';
import { CalendarRepository } from '../calendar/calendar.repository';
import { OutlookCalendarProvider } from '../calendar/providers/outlook-calendar.provider';
import { MeetingOAuthStateService } from './meeting-oauth-state.service';

type CalendarConnectionMetadata = {
  connectedByUserId?: string;
  providerAccountId?: string;
  providerEmail?: string;
  providerName?: string;
  scopes?: string[];
};

@Injectable()
export class OutlookCalendarAuthService {
  private readonly providerType = CalendarProviderType.OUTLOOK_CALENDAR;

  constructor(
    private readonly repository: CalendarRepository,
    private readonly oauthState: MeetingOAuthStateService,
    private readonly provider: OutlookCalendarProvider,
    private readonly config: ConfigService,
  ) {}

  async createAuthorizationUrl(organizationId: string, userId: string) {
    const state = await this.oauthState.create(
      this.providerType,
      organizationId,
      userId,
    );
    return { authorizationUrl: this.provider.getAuthorizationUrl(state) };
  }

  async completeAuthorization(code: string, state: string) {
    const context = await this.oauthState.consume(state, this.providerType);
    const existing = await this.repository.find(
      context.organizationId,
      this.providerType,
    );
    const tokens = await this.provider.exchangeCode(code);
    let refreshToken = tokens.refresh_token;
    if (!refreshToken && existing?.refreshToken) {
      refreshToken = decryptText(existing.refreshToken, this.encryptionKey);
    }
    if (!tokens.access_token || !refreshToken) {
      throw new BadRequestException(
        'Microsoft did not return the required OAuth tokens; reconnect the account',
      );
    }
    const profile = await this.provider.getProfile(tokens.access_token);
    await this.repository.upsert(context.organizationId, this.providerType, {
      status: 'CONNECTED',
      accessToken: encryptText(tokens.access_token, this.encryptionKey),
      refreshToken: encryptText(refreshToken, this.encryptionKey),
      expiresAt: tokens.expires_in
        ? new Date(Date.now() + tokens.expires_in * 1000)
        : undefined,
      metadata: {
        connectedByUserId: context.userId,
        providerAccountId: profile.id,
        providerEmail: profile.mail || profile.userPrincipalName,
        providerName: profile.displayName,
        scopes: tokens.scope?.split(' ').filter(Boolean),
      } satisfies CalendarConnectionMetadata,
    });
    await this.repository.ensureDefault(context.organizationId);
    return { connected: true, organizationId: context.organizationId };
  }

  async getConnection(organizationId: string) {
    const connection = await this.repository.find(
      organizationId,
      this.providerType,
    );
    if (!connection) return { connected: false };
    const metadata = connection.metadata as
      CalendarConnectionMetadata | undefined;
    return {
      connected: connection.status === 'CONNECTED',
      status: connection.status,
      provider: this.providerType,
      isDefault: connection.isDefaultCalendar === true,
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
      this.providerType,
    );
    if (!connection) return { connected: false };
    await this.repository.disconnect(organizationId, this.providerType);
    return { connected: false, disconnected: true };
  }

  callbackUrl(connected: boolean, error?: string) {
    return this.oauthState.callbackUrl(this.providerType, connected, error);
  }

  private get encryptionKey() {
    const key = this.config.getOrThrow<string>('integrations.encryptionKey');
    if (key.length < 32) {
      throw new ServiceUnavailableException(
        'INTEGRATION_ENCRYPTION_KEY must contain at least 32 characters',
      );
    }
    return key;
  }
}
