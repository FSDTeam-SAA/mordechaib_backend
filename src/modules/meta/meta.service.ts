import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import crypto from 'crypto';
import {
  decryptText,
  encryptText,
} from '../../common/helpers/crypto.helper';
import { IntegrationProvider } from '../../database/schemas/integration.schema';
import {
  MetaInsightsQueryDto,
  MetaListQueryDto,
  MetaOverviewQueryDto,
} from './dto/meta-query.dto';
import { MetaRepository } from './meta.repository';
import { MetaProvider } from './providers/meta.provider';
import { resolveMetaTimeRange } from './utils/meta-date-filter.util';

type MetaOAuthState = {
  organizationId: string;
  userId: string;
  issuedAt: number;
  nonce: string;
};

type StoredMetaPage = {
  id?: string;
  name?: string;
  accessToken?: string;
  instagramBusinessAccount?: Record<string, unknown>;
  [key: string]: unknown;
};

type MetaIntegrationMetadata = {
  connectedByUserId?: string;
  pages?: StoredMetaPage[];
  [key: string]: unknown;
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
    const metadata = integration.metadata as MetaIntegrationMetadata | undefined;
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

  async getPagePosts(
    organizationId: string,
    pageId: string,
    query: MetaListQueryDto,
  ) {
    const timeRange = resolveMetaTimeRange(query);
    const page = await this.resolveStoredPage(organizationId, pageId);
    return this.provider.getPagePosts(page.id, page.accessToken, {
      limit: query.limit,
      ...timeRange,
    });
  }

  async getPostComments(
    organizationId: string,
    pageId: string,
    postId: string,
    query: MetaListQueryDto,
  ) {
    const timeRange = resolveMetaTimeRange(query);
    const page = await this.resolveStoredPage(organizationId, pageId);
    return this.provider.getPostComments(postId, page.accessToken, {
      limit: query.limit,
      ...timeRange,
    });
  }

  async getPageMessages(
    organizationId: string,
    pageId: string,
    query: MetaListQueryDto,
  ) {
    const timeRange = resolveMetaTimeRange(query);
    const page = await this.resolveStoredPage(organizationId, pageId);
    return this.provider.getPageMessages(page.id, page.accessToken, {
      limit: query.limit,
      ...timeRange,
    });
  }

  async getPageInsights(
    organizationId: string,
    pageId: string,
    query: MetaInsightsQueryDto,
  ) {
    const timeRange = resolveMetaTimeRange(query);
    const page = await this.resolveStoredPage(organizationId, pageId);
    return this.provider.getPageInsights(page.id, page.accessToken, {
      metrics: this.parseMetrics(query.metrics),
      period: query.period,
      ...timeRange,
    });
  }

  async getPageOverview(
    organizationId: string,
    pageId: string,
    query: MetaOverviewQueryDto,
  ) {
    const timeRange = resolveMetaTimeRange(query);
    const page = await this.resolveStoredPage(organizationId, pageId);
    const [posts, messages, insights] = await Promise.all([
      this.provider.getPagePosts(page.id, page.accessToken, {
        limit: query.limit,
        ...timeRange,
      }),
      this.provider.getPageMessages(page.id, page.accessToken, {
        limit: query.limit,
        ...timeRange,
      }),
      this.provider.getPageInsights(page.id, page.accessToken, {
        metrics: this.parseMetrics(query.metrics),
        period: query.period,
        ...timeRange,
      }),
    ]);

    return {
      page: {
        id: page.id,
        name: page.name,
        instagramBusinessAccount: page.instagramBusinessAccount,
      },
      posts,
      messages,
      insights,
    };
  }

  private parseMetrics(metrics?: string): string[] | undefined {
    if (!metrics) return undefined;

    const metricList = metrics
      .split(',')
      .map((metric) => metric.trim())
      .filter(Boolean);

    return metricList.length ? metricList : undefined;
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

  private async resolveStoredPage(organizationId: string, pageId: string) {
    const integration = await this.repository.findByOrganization(organizationId);
    if (!integration) {
      throw new NotFoundException('Meta integration is not connected');
    }
    const metadata = integration.metadata as MetaIntegrationMetadata | undefined;
    const pages = Array.isArray(metadata?.pages) ? metadata.pages : [];
    const storedPage = pages.find((page) => page?.id === pageId);
    if (!storedPage) {
      throw new NotFoundException('Meta page not found');
    }
    if (!storedPage.accessToken || typeof storedPage.accessToken !== 'string') {
      throw new BadRequestException('Stored page access token is missing');
    }
    return {
      id: storedPage.id as string,
      name: storedPage.name as string | undefined,
      accessToken: decryptText(storedPage.accessToken, this.encryptionKey),
      instagramBusinessAccount:
        storedPage.instagramBusinessAccount as Record<string, unknown> | undefined,
    };
  }
}
