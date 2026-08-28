import {
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import crypto from 'crypto';
import { MeetingPlatform } from '../../common/enums/meeting-platform.enum';
import { MeetingOAuthStateService } from './meeting-oauth-state.service';
import {
  MeetingConnectionMetadata,
  MeetingPlatformConnectionsRepository,
} from './meeting-platform-connections.repository';
import { RecallZoomAuthProvider } from './providers/recall-zoom-auth.provider';
import { ZoomConnectionsRepository } from './zoom-connections.repository';

@Injectable()
export class ZoomAuthService {
  constructor(
    private readonly repository: MeetingPlatformConnectionsRepository,
    private readonly legacyRepository: ZoomConnectionsRepository,
    private readonly provider: RecallZoomAuthProvider,
    private readonly oauthState: MeetingOAuthStateService,
    private readonly config: ConfigService,
  ) {}

  get signedInEnabled() {
    return this.config.get<boolean>('recall.zoom.signedIn', true);
  }

  async assertConnected(organizationId: string) {
    if (
      this.signedInEnabled &&
      !(await this.repository.findConnected(
        organizationId,
        MeetingPlatform.ZOOM,
      ))
    ) {
      throw new ServiceUnavailableException(
        'The organization Zoom account is not connected',
      );
    }
  }

  async createAuthorizationUrl(organizationId: string, userId: string) {
    const state = await this.oauthState.create(
      MeetingPlatform.ZOOM,
      organizationId,
      userId,
    );
    return { authorizationUrl: this.provider.getAuthorizationUrl(state) };
  }

  async completeAuthorization(code: string, state: string) {
    const context = await this.oauthState.consume(state, MeetingPlatform.ZOOM);
    const credential = await this.provider.createCredential(code);
    const accessToken = await this.provider.getAccessToken(credential.id);
    const profile = await this.provider.getCurrentUser(accessToken);
    const existing = await this.repository.find(
      context.organizationId,
      MeetingPlatform.ZOOM,
    );
    const previousMetadata = existing?.metadata as
      | MeetingConnectionMetadata
      | undefined;
    await this.repository.upsert(
      context.organizationId,
      MeetingPlatform.ZOOM,
      {
        status: 'CONNECTED',
        metadata: {
          connectedByUserId: context.userId,
          providerAccountId: profile.id,
          providerEmail: profile.email,
          providerName:
            profile.display_name ||
            [profile.first_name, profile.last_name].filter(Boolean).join(' '),
          recallCredentialId: credential.id,
          recallOAuthAppId: this.config.getOrThrow<string>(
            'recall.zoom.oauthAppId',
          ),
        } satisfies MeetingConnectionMetadata,
      },
    );
    if (
      previousMetadata?.recallCredentialId &&
      previousMetadata.recallCredentialId !== credential.id
    ) {
      await this.provider
        .deleteCredential(previousMetadata.recallCredentialId)
        .catch(() => undefined);
    }
    return { connected: true, organizationId: context.organizationId };
  }

  async getConnection(organizationId: string) {
    const connection = await this.repository.find(
      organizationId,
      MeetingPlatform.ZOOM,
    );
    if (!connection) return { connected: false };
    const metadata = connection.metadata as
      | MeetingConnectionMetadata
      | undefined;
    return {
      connected: connection.status === 'CONNECTED',
      status: connection.status,
      provider: 'ZOOM',
      account: {
        id: metadata?.providerAccountId,
        email: metadata?.providerEmail,
        name: metadata?.providerName,
      },
      connectedByUserId: metadata?.connectedByUserId,
    };
  }

  async disconnect(organizationId: string) {
    const connection = await this.repository.find(
      organizationId,
      MeetingPlatform.ZOOM,
    );
    if (!connection) return { connected: false };
    const metadata = connection.metadata as
      | MeetingConnectionMetadata
      | undefined;
    if (metadata?.recallCredentialId) {
      await this.provider
        .deleteCredential(metadata.recallCredentialId)
        .catch(() => undefined);
    }
    await this.repository.disconnect(organizationId, MeetingPlatform.ZOOM);
    return { connected: false, disconnected: true };
  }

  async getAccessToken(organizationId: string) {
    const metadata = await this.connectedMetadata(organizationId);
    return this.provider.getAccessToken(metadata.recallCredentialId!);
  }

  async getZakToken(organizationId: string) {
    const metadata = await this.connectedMetadata(organizationId);
    return this.provider.getZakToken(metadata.recallCredentialId!);
  }

  async getLegacyZakToken() {
    const connection = await this.legacyRepository.getConnected();
    if (!connection) {
      throw new ServiceUnavailableException(
        'The legacy signed-in Zoom service account is not connected',
      );
    }
    return this.provider.getZakToken(connection.recallCredentialId);
  }

  createZakCallbackUrl(organizationId: string) {
    const token = crypto
      .createHmac('sha256', this.callbackSecret)
      .update(organizationId)
      .digest('base64url');
    return `${this.publicBaseUrl}/api/v1/webhooks/recall/zoom-zak/${encodeURIComponent(organizationId)}?token=${encodeURIComponent(token)}`;
  }

  verifyZakCallback(organizationId: string, token: string) {
    const expected = crypto
      .createHmac('sha256', this.callbackSecret)
      .update(organizationId)
      .digest('base64url');
    if (
      !token ||
      token.length !== expected.length ||
      !crypto.timingSafeEqual(Buffer.from(token), Buffer.from(expected))
    ) {
      throw new UnauthorizedException('Invalid Zoom ZAK callback token');
    }
  }

  callbackUrl(connected: boolean, error?: string) {
    return this.oauthState.callbackUrl(MeetingPlatform.ZOOM, connected, error);
  }

  private async connectedMetadata(organizationId: string) {
    const connection = await this.repository.findConnected(
      organizationId,
      MeetingPlatform.ZOOM,
    );
    const metadata = connection?.metadata as
      | MeetingConnectionMetadata
      | undefined;
    if (!metadata?.recallCredentialId) {
      throw new ServiceUnavailableException(
        'The organization Zoom account is not connected',
      );
    }
    return metadata;
  }

  private get callbackSecret() {
    return this.config.getOrThrow<string>('meetingPlatforms.oauthStateSecret');
  }

  private get publicBaseUrl() {
    return this.config
      .getOrThrow<string>('APP_BASE_URL')
      .trim()
      .replace(/\/+$/, '');
  }
}
