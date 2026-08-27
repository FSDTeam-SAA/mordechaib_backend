import {
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import crypto from 'crypto';
import { RecallZoomAuthProvider } from './providers/recall-zoom-auth.provider';
import { ZoomConnectionsRepository } from './zoom-connections.repository';

type ZoomOAuthState = {
  userId: string;
  issuedAt: number;
  nonce: string;
};

@Injectable()
export class ZoomAuthService {
  constructor(
    private readonly repository: ZoomConnectionsRepository,
    private readonly provider: RecallZoomAuthProvider,
    private readonly config: ConfigService,
  ) {}

  get signedInEnabled() {
    return this.config.get<boolean>('recall.zoom.signedIn', true);
  }

  async assertConnected() {
    if (this.signedInEnabled && !(await this.repository.getConnected())) {
      throw new ServiceUnavailableException(
        'The signed-in Zoom service account is not connected',
      );
    }
  }

  createAuthorizationUrl(userId: string) {
    return {
      authorizationUrl: this.provider.getAuthorizationUrl(
        this.createOAuthState(userId),
      ),
    };
  }

  async completeAuthorization(code: string, state: string) {
    const context = this.verifyOAuthState(state);
    const credential = await this.provider.createCredential(code);
    const connection = await this.repository.upsert({
      recallOAuthAppId: this.config.getOrThrow<string>(
        'recall.zoom.oauthAppId',
      ),
      recallCredentialId: credential.id,
      connectedByUserId: context.userId,
    });
    return { connected: true, status: connection?.status };
  }

  async getConnection() {
    const connection = await this.repository.getConnected();
    return connection
      ? {
          connected: true,
          status: connection.status,
          recallOAuthAppId: connection.recallOAuthAppId,
          connectedByUserId: connection.connectedByUserId,
        }
      : { connected: false };
  }

  async getZakToken() {
    const connection = await this.repository.getConnected();
    if (!connection) {
      throw new ServiceUnavailableException(
        'The signed-in Zoom service account is not connected',
      );
    }
    return this.provider.getZakToken(connection.recallCredentialId);
  }

  get zakCallbackUrl() {
    return `${this.publicBaseUrl}/api/v1/webhooks/recall/zoom-zak`;
  }

  private createOAuthState(userId: string) {
    const payload: ZoomOAuthState = {
      userId,
      issuedAt: Date.now(),
      nonce: crypto.randomBytes(16).toString('hex'),
    };
    const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
    return `${encoded}.${this.signState(encoded)}`;
  }

  private verifyOAuthState(value: string) {
    const [encoded, signature] = value.split('.');
    const expected = this.signState(encoded || '');
    if (
      !encoded ||
      !signature ||
      signature.length !== expected.length ||
      !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
    ) {
      throw new UnauthorizedException('Invalid Zoom OAuth state');
    }
    let payload: ZoomOAuthState;
    try {
      payload = JSON.parse(
        Buffer.from(encoded, 'base64url').toString('utf8'),
      ) as ZoomOAuthState;
    } catch {
      throw new UnauthorizedException('Invalid Zoom OAuth state');
    }
    if (Date.now() - payload.issuedAt > 10 * 60 * 1000) {
      throw new UnauthorizedException('Zoom OAuth state has expired');
    }
    return payload;
  }

  private signState(value: string) {
    return crypto
      .createHmac('sha256', this.oauthStateSecret)
      .update(value)
      .digest('base64url');
  }

  private get oauthStateSecret() {
    return this.config.getOrThrow<string>('recall.oauthStateSecret');
  }

  private get publicBaseUrl() {
    return this.config
      .getOrThrow<string>('APP_BASE_URL')
      .trim()
      .replace(/\/+$/, '');
  }
}
