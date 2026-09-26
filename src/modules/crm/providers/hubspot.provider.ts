import {
  BadGatewayException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CrmAccountProfile,
  CrmDealPage,
  CrmOauthTokens,
  CrmProvider,
  CrmProviderHttpError,
  CreateCrmContactInput,
  CreateCrmDealInput,
  NormalizedCrmDeal,
  UpdateCrmDealInput,
} from '../../../common/types/crm-provider.interface';
import { IntegrationProvider } from '../../../database/schemas/integration.schema';

type HubSpotObject = {
  id?: string;
  archived?: boolean;
  updatedAt?: string;
  properties?: Record<string, unknown>;
};

type HubSpotPage = {
  results?: HubSpotObject[];
  paging?: { next?: { after?: string } };
};

type HubSpotTokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  scopes?: string[];
  hub_id?: string | number;
  error?: string;
  error_description?: string;
};

@Injectable()
export class HubSpotProvider implements CrmProvider {
  readonly provider = IntegrationProvider.HUBSPOT;

  constructor(private readonly config: ConfigService) {}

  authorizationUrl(state: string) {
    this.assertConfigured();
    const url = new URL('https://app.hubspot.com/oauth/authorize');
    url.search = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      response_type: 'code',
      state,
      scope: this.scopes.join(' '),
    }).toString();
    return url.toString();
  }

  async exchangeCode(code: string): Promise<CrmOauthTokens> {
    return this.tokens(
      await this.tokenRequest({
        grant_type: 'authorization_code',
        client_id: this.clientId,
        client_secret: this.clientSecret,
        redirect_uri: this.redirectUri,
        code,
      }),
    );
  }

  async refreshAccessToken(refreshToken: string): Promise<CrmOauthTokens> {
    return this.tokens(
      await this.tokenRequest({
        grant_type: 'refresh_token',
        client_id: this.clientId,
        client_secret: this.clientSecret,
        refresh_token: refreshToken,
      }),
    );
  }

  async getProfile(
    _accessToken: string,
    context: { providerAccountId?: string } = {},
  ): Promise<CrmAccountProfile> {
    if (!context.providerAccountId) {
      throw new BadGatewayException('HubSpot account identity is incomplete');
    }
    return {
      id: context.providerAccountId,
      organizationId: context.providerAccountId,
    };
  }

  async listDeals(
    accessToken: string,
    input: { cursor?: string; modifiedSince?: Date },
  ): Promise<CrmDealPage> {
    const body: Record<string, unknown> = {
      limit: 100,
      sorts: ['hs_lastmodifieddate'],
      properties: [
        'dealname',
        'amount',
        'dealstage',
        'closedate',
        'hubspot_owner_id',
        'hs_lastmodifieddate',
        'hs_currency_code',
      ],
      ...(input.cursor ? { after: input.cursor } : {}),
    };
    if (input.modifiedSince) {
      body.filterGroups = [
        {
          filters: [
            {
              propertyName: 'hs_lastmodifieddate',
              operator: 'GTE',
              value: String(input.modifiedSince.getTime()),
            },
          ],
        },
      ];
    }
    const page = await this.request<HubSpotPage>(
      'https://api.hubapi.com/crm/v3/objects/deals/search',
      accessToken,
      {
        method: 'POST',
        body: JSON.stringify(body),
      },
    );
    return {
      items: (page.results || [])
        .map((deal) => this.normalizeDeal(deal))
        .filter((deal): deal is NormalizedCrmDeal => Boolean(deal)),
      cursor: page.paging?.next?.after,
      done: !page.paging?.next?.after,
    };
  }

  async createDeal(
    accessToken: string,
    input: CreateCrmDealInput,
  ): Promise<NormalizedCrmDeal> {
    const result = await this.request<HubSpotObject>(
      'https://api.hubapi.com/crm/v3/objects/deals',
      accessToken,
      {
        method: 'POST',
        body: JSON.stringify({ properties: this.dealProperties(input) }),
      },
    );
    const deal = this.normalizeDeal(result);
    if (!deal)
      throw new BadGatewayException('HubSpot returned an invalid deal');
    return deal;
  }

  async updateDeal(
    accessToken: string,
    externalId: string,
    input: UpdateCrmDealInput,
  ): Promise<NormalizedCrmDeal> {
    const result = await this.request<HubSpotObject>(
      `https://api.hubapi.com/crm/v3/objects/deals/${encodeURIComponent(externalId)}`,
      accessToken,
      {
        method: 'PATCH',
        body: JSON.stringify({ properties: this.dealProperties(input) }),
      },
    );
    const deal = this.normalizeDeal(result);
    if (!deal)
      throw new BadGatewayException('HubSpot returned an invalid deal');
    return deal;
  }

  createContact(accessToken: string, input: CreateCrmContactInput) {
    return this.request(
      'https://api.hubapi.com/crm/v3/objects/contacts',
      accessToken,
      {
        method: 'POST',
        body: JSON.stringify({
          properties: {
            email: input.email,
            firstname: input.name,
            ...(input.phone ? { phone: input.phone } : {}),
          },
        }),
      },
    );
  }

  async revokeToken(token: string) {
    let response: Response;
    try {
      response = await fetch(
        `https://api.hubapi.com/oauth/v1/refresh-tokens/${encodeURIComponent(token)}`,
        {
          method: 'DELETE',
          signal: AbortSignal.timeout(this.timeoutMs),
        },
      );
    } catch {
      throw new ServiceUnavailableException(
        'HubSpot revoke request is unavailable',
      );
    }
    if (!response.ok && response.status !== 404) {
      throw new CrmProviderHttpError(
        response.status,
        'HubSpot token revocation failed',
      );
    }
  }

  private normalizeDeal(value: HubSpotObject): NormalizedCrmDeal | undefined {
    if (!value.id) return undefined;
    const properties = value.properties || {};
    const stage = this.string(properties.dealstage) || 'unknown';
    return {
      externalId: value.id,
      name: this.string(properties.dealname) || '(Untitled deal)',
      amount: this.number(properties.amount),
      currency: (
        this.string(properties.hs_currency_code) || 'USD'
      ).toUpperCase(),
      providerStage: stage,
      stageCategory: this.stageCategory(stage),
      closeDate: this.date(properties.closedate),
      ownerId: this.string(properties.hubspot_owner_id),
      archived: value.archived === true,
      providerUpdatedAt: this.date(
        properties.hs_lastmodifieddate || value.updatedAt,
      ),
      rawPayload: value as Record<string, unknown>,
    };
  }

  private dealProperties(input: CreateCrmDealInput | UpdateCrmDealInput) {
    return {
      ...(input.name !== undefined ? { dealname: input.name } : {}),
      ...(input.amount !== undefined ? { amount: String(input.amount) } : {}),
      ...(input.currency !== undefined
        ? { hs_currency_code: input.currency.toUpperCase() }
        : {}),
      ...(input.providerStage !== undefined
        ? { dealstage: input.providerStage }
        : {}),
      ...(input.closeDate !== undefined
        ? { closedate: input.closeDate.toISOString() }
        : {}),
      ...(input.ownerId !== undefined
        ? { hubspot_owner_id: input.ownerId }
        : {}),
    };
  }

  private stageCategory(stage: string): NormalizedCrmDeal['stageCategory'] {
    const normalized = stage.trim().toLowerCase();
    if (normalized.includes('won') || normalized === 'closedwon') return 'WON';
    if (
      normalized.includes('lost') ||
      normalized.includes('closedlost') ||
      normalized.includes('abandon')
    ) {
      return 'LOST';
    }
    return 'OPEN';
  }

  private async tokenRequest(parameters: Record<string, string>) {
    this.assertConfigured();
    let response: Response;
    try {
      response = await fetch('https://api.hubapi.com/oauth/v3/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(parameters),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch {
      throw new ServiceUnavailableException('HubSpot OAuth is unavailable');
    }
    const body = (await response
      .json()
      .catch(() => ({}))) as HubSpotTokenResponse;
    if (!response.ok || !body.access_token) {
      throw new CrmProviderHttpError(
        response.status,
        body.error_description || body.error || 'HubSpot OAuth failed',
      );
    }
    return body;
  }

  private tokens(value: HubSpotTokenResponse): CrmOauthTokens {
    if (!value.access_token)
      throw new BadGatewayException('HubSpot token is missing');
    return {
      accessToken: value.access_token,
      refreshToken: value.refresh_token,
      expiresIn: value.expires_in,
      scopes: value.scopes || value.scope?.split(' ').filter(Boolean),
      providerAccountId:
        typeof value.hub_id === 'string' || typeof value.hub_id === 'number'
          ? String(value.hub_id)
          : undefined,
    };
  }

  private async request<T>(
    url: string,
    accessToken: string,
    init: RequestInit = {},
  ) {
    let response: Response;
    try {
      response = await fetch(url, {
        ...init,
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/json',
          ...(init.body ? { 'Content-Type': 'application/json' } : {}),
          ...init.headers,
        },
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch {
      throw new ServiceUnavailableException('HubSpot API is unavailable');
    }
    const body = (await response.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    if (!response.ok) {
      const category = this.string(body.category);
      const message =
        this.string(body.message) ||
        `HubSpot API failed with HTTP ${response.status}`;
      throw new CrmProviderHttpError(
        response.status,
        category ? `${category}: ${message}` : message,
      );
    }
    return body as T;
  }

  private assertConfigured() {
    if (!this.clientId || !this.clientSecret || !this.redirectUri) {
      throw new ServiceUnavailableException('HubSpot OAuth is not configured');
    }
  }

  private get clientId() {
    return this.config.get<string>('crm.hubspot.clientId') || '';
  }

  private get clientSecret() {
    return this.config.get<string>('crm.hubspot.clientSecret') || '';
  }

  private get redirectUri() {
    return this.config.get<string>('crm.hubspot.redirectUri') || '';
  }

  private get scopes() {
    return this.config.get<string[]>('crm.hubspot.scopes', []);
  }

  private get timeoutMs() {
    return this.config.get<number>('crm.requestTimeoutMs', 20_000);
  }

  private string(value: unknown) {
    return typeof value === 'string' && value.trim() ? value.trim() : undefined;
  }

  private number(value: unknown) {
    const parsed = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  private date(value: unknown) {
    if (typeof value !== 'string' || !value) return undefined;
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? undefined : parsed;
  }
}
