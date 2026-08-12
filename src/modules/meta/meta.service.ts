import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import crypto from 'crypto';
import { encryptText } from '../../common/helpers/crypto.helper';
import { IntegrationProvider } from '../../database/schemas/integration.schema';
import { MetaRepository } from './meta.repository';
import { MetaProvider } from './providers/meta.provider';

type MetaOAuthState = {
  organizationId: string;
  userId: string;
  issuedAt: number;
  nonce: string;
};

@Injectable()
export class MetaService {
  constructor(
    private readonly repository: MetaRepository,
    private readonly provider: MetaProvider,
    private readonly config: ConfigService,
  ) {}

  createAuthorizationUrl(organizationId: string, userId: string) {
    return {
      authorizationUrl: this.provider.getAuthorizationUrl(
        this.createState(organizationId, userId),
      ),
    };
  }

  async completeAuthorization(code: string, state: string) {
    const context = this.verifyState(state);
    const shortLivedToken = await this.provider.exchangeCode(code);
    const longLivedToken = await this.provider.exchangeLongLivedToken(
      shortLivedToken.access_token,
    );
    const pages = await this.provider.getPages(longLivedToken.access_token);

    const saved = await this.repository.upsert(context.organizationId, {
      provider: IntegrationProvider.META,
      status: 'CONNECTED',
      accessToken: encryptText(longLivedToken.access_token, this.encryptionKey),
      expiresAt: longLivedToken.expires_in
        ? new Date(Date.now() + longLivedToken.expires_in * 1000)
        : undefined,
      metadata: {
        connectedByUserId: context.userId,
        pages: pages.data.map((page) => ({
          id: page.id,
          name: page.name,
          accessToken:
            typeof page.access_token === 'string'
              ? encryptText(page.access_token, this.encryptionKey)
              : undefined,
          instagramBusinessAccount: page.instagram_business_account,
        })),
      },
    });

    return {
      organizationId: context.organizationId,
      provider: saved?.provider,
      status: saved?.status,
      pages: pages.data.map((page) => {
        const safePage = { ...page };
        delete safePage.access_token;
        return safePage;
      }),
    };
  }

  async getConnection(organizationId: string) {
    const integration =
      await this.repository.findByOrganization(organizationId);
    if (!integration) return { connected: false };
    const metadata = integration.metadata as
      Record<string, unknown> | undefined;
    const pages = Array.isArray(metadata?.pages)
      ? metadata.pages.map((page) => {
          if (!page || typeof page !== 'object') return page;
          const safePage = { ...(page as Record<string, unknown>) };
          delete safePage.accessToken;
          return safePage;
        })
      : [];
    return {
      connected: integration.status === 'CONNECTED',
      provider: integration.provider,
      status: integration.status,
      expiresAt: integration.expiresAt,
      metadata: { ...metadata, pages },
    };
  }

  private createState(organizationId: string, userId: string) {
    const payload: MetaOAuthState = {
      organizationId,
      userId,
      issuedAt: Date.now(),
      nonce: crypto.randomBytes(16).toString('hex'),
    };
    const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
    return `${encoded}.${this.sign(encoded)}`;
  }

  private verifyState(value: string): MetaOAuthState {
    const [encoded, signature] = value.split('.');
    const expectedSignature = this.sign(encoded || '');
    if (
      !encoded ||
      !signature ||
      signature.length !== expectedSignature.length ||
      !crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(expectedSignature),
      )
    ) {
      throw new UnauthorizedException('Invalid Meta OAuth state');
    }
    let payload: MetaOAuthState;
    try {
      payload = JSON.parse(
        Buffer.from(encoded, 'base64url').toString(),
      ) as MetaOAuthState;
    } catch {
      throw new UnauthorizedException('Invalid Meta OAuth state');
    }
    if (Date.now() - payload.issuedAt > 10 * 60 * 1000) {
      throw new UnauthorizedException('Meta OAuth state has expired');
    }
    return payload;
  }

  private sign(value: string) {
    return crypto
      .createHmac('sha256', this.stateSecret)
      .update(value)
      .digest('base64url');
  }

  private get stateSecret() {
    return this.config.getOrThrow<string>('meta.stateSecret');
  }

  private get encryptionKey() {
    const key = this.config.getOrThrow<string>('meta.encryptionKey');
    if (key.length < 32)
      throw new BadRequestException(
        'INTEGRATION_ENCRYPTION_KEY must contain at least 32 characters',
      );
    return key;
  }
}
