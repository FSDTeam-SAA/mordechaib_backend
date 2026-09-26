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

type SalesforceTokenResponse = {
  access_token?: string;
  refresh_token?: string;
  instance_url?: string;
  id?: string;
  issued_at?: string;
  error?: string;
  error_description?: string;
};

type SalesforceOpportunity = {
  Id?: string;
  Name?: string;
  Amount?: number | string | null;
  CurrencyIsoCode?: string;
  StageName?: string;
  CloseDate?: string;
  OwnerId?: string;
  LastModifiedDate?: string;
  IsClosed?: boolean;
  IsWon?: boolean;
  IsDeleted?: boolean;
};

type SalesforceQueryResponse = {
  records?: SalesforceOpportunity[];
  done?: boolean;
  nextRecordsUrl?: string;
};

@Injectable()
export class SalesforceProvider implements CrmProvider {
  readonly provider = IntegrationProvider.SALESFORCE;

  constructor(private readonly config: ConfigService) {}

  authorizationUrl(state: string) {
    this.assertConfigured();
    const url = new URL(`${this.loginUrl}/services/oauth2/authorize`);
    url.search = new URLSearchParams({
      response_type: 'code',
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
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
    accessToken: string,
    context: { instanceUrl?: string; identityUrl?: string } = {},
  ): Promise<CrmAccountProfile> {
    const identityUrl = context.identityUrl;
    if (!identityUrl) {
      throw new BadGatewayException('Salesforce identity URL is missing');
    }
    const profile = await this.request<Record<string, unknown>>(
      identityUrl,
      accessToken,
    );
    const id = profile.user_id || profile.id;
    if (typeof id !== 'string' && typeof id !== 'number') {
      throw new BadGatewayException(
        'Salesforce account identity is incomplete',
      );
    }
    return {
      id: String(id),
      name: this.string(profile.display_name),
      email: this.string(profile.email),
      organizationId:
        typeof profile.organization_id === 'string'
          ? profile.organization_id
          : undefined,
    };
  }

  async listDeals(
    accessToken: string,
    input: { cursor?: string; modifiedSince?: Date; instanceUrl?: string },
  ): Promise<CrmDealPage> {
    const instanceUrl = this.instanceUrl(input.instanceUrl);
    const url = input.cursor
      ? `${instanceUrl}${input.cursor}`
      : `${instanceUrl}/services/data/v60.0/query?${new URLSearchParams({
          q: this.query(input.modifiedSince),
        }).toString()}`;
    const page = await this.request<SalesforceQueryResponse>(url, accessToken);
    return {
      items: (page.records || [])
        .map((deal) => this.normalizeDeal(deal))
        .filter((deal): deal is NormalizedCrmDeal => Boolean(deal)),
      cursor: page.nextRecordsUrl,
      done: page.done !== false,
    };
  }

  async createDeal(
    accessToken: string,
    input: CreateCrmDealInput & { instanceUrl?: string },
  ): Promise<NormalizedCrmDeal> {
    const instanceUrl = this.instanceUrl(input.instanceUrl);
    const created = await this.request<{ id?: string; success?: boolean }>(
      `${instanceUrl}/services/data/v60.0/sobjects/Opportunity`,
      accessToken,
      { method: 'POST', body: JSON.stringify(this.dealBody(input, true)) },
    );
    if (!created.id || created.success !== true) {
      throw new BadGatewayException('Salesforce did not confirm deal creation');
    }
    return this.fetchDeal(accessToken, instanceUrl, created.id);
  }

  async updateDeal(
    accessToken: string,
    externalId: string,
    input: UpdateCrmDealInput & { instanceUrl?: string },
  ): Promise<NormalizedCrmDeal> {
    const instanceUrl = this.instanceUrl(input.instanceUrl);
    await this.request<void>(
      `${instanceUrl}/services/data/v60.0/sobjects/Opportunity/${encodeURIComponent(externalId)}`,
      accessToken,
      { method: 'PATCH', body: JSON.stringify(this.dealBody(input, false)) },
      [204],
    );
    return this.fetchDeal(accessToken, instanceUrl, externalId);
  }

  createContact(
    accessToken: string,
    input: CreateCrmContactInput & { instanceUrl?: string },
  ) {
    const [firstName, ...rest] = input.name.trim().split(/\s+/);
    return this.request(
      `${this.instanceUrl(input.instanceUrl)}/services/data/v60.0/sobjects/Contact`,
      accessToken,
      {
        method: 'POST',
        body: JSON.stringify({
          FirstName: firstName,
          LastName: rest.join(' ') || firstName,
          Email: input.email,
          ...(input.phone ? { Phone: input.phone } : {}),
        }),
      },
    );
  }

  private async fetchDeal(
    accessToken: string,
    instanceUrl: string,
    externalId: string,
  ) {
    const fields =
      'Id,Name,Amount,CurrencyIsoCode,StageName,CloseDate,OwnerId,LastModifiedDate,IsClosed,IsWon,IsDeleted';
    const deal = await this.request<SalesforceOpportunity>(
      `${instanceUrl}/services/data/v60.0/sobjects/Opportunity/${encodeURIComponent(externalId)}?fields=${encodeURIComponent(fields)}`,
      accessToken,
    );
    const normalized = this.normalizeDeal(deal);
    if (!normalized)
      throw new BadGatewayException('Salesforce returned an invalid deal');
    return normalized;
  }

  private query(modifiedSince?: Date) {
    const where = modifiedSince
      ? ` WHERE LastModifiedDate >= ${modifiedSince.toISOString()}`
      : '';
    return `SELECT Id,Name,Amount,CurrencyIsoCode,StageName,CloseDate,OwnerId,LastModifiedDate,IsClosed,IsWon,IsDeleted FROM Opportunity${where} ORDER BY LastModifiedDate ASC LIMIT 200`;
  }

  private normalizeDeal(
    value: SalesforceOpportunity,
  ): NormalizedCrmDeal | undefined {
    if (!value.Id) return undefined;
    const stage = value.StageName?.trim() || 'Unknown';
    return {
      externalId: value.Id,
      name: value.Name?.trim() || '(Untitled opportunity)',
      amount: this.number(value.Amount),
      currency: (value.CurrencyIsoCode || 'USD').toUpperCase(),
      providerStage: stage,
      stageCategory:
        value.IsWon === true
          ? 'WON'
          : value.IsClosed === true
            ? 'LOST'
            : 'OPEN',
      closeDate: this.date(value.CloseDate),
      ownerId: value.OwnerId,
      archived: value.IsDeleted === true,
      providerUpdatedAt: this.date(value.LastModifiedDate),
      rawPayload: value as Record<string, unknown>,
    };
  }

  private dealBody(
    input: CreateCrmDealInput | UpdateCrmDealInput,
    creating: boolean,
  ) {
    return {
      ...(input.name !== undefined ? { Name: input.name } : {}),
      ...(input.amount !== undefined ? { Amount: input.amount } : {}),
      ...(input.currency !== undefined
        ? { CurrencyIsoCode: input.currency.toUpperCase() }
        : {}),
      ...(input.providerStage !== undefined
        ? { StageName: input.providerStage }
        : creating
          ? { StageName: 'Prospecting' }
          : {}),
      ...(input.closeDate !== undefined
        ? { CloseDate: input.closeDate.toISOString().slice(0, 10) }
        : creating
          ? { CloseDate: new Date().toISOString().slice(0, 10) }
          : {}),
      ...(input.ownerId !== undefined ? { OwnerId: input.ownerId } : {}),
    };
  }

  private async tokenRequest(parameters: Record<string, string>) {
    this.assertConfigured();
    let response: Response;
    try {
      response = await fetch(`${this.loginUrl}/services/oauth2/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(parameters),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch {
      throw new ServiceUnavailableException('Salesforce OAuth is unavailable');
    }
    const body = (await response
      .json()
      .catch(() => ({}))) as SalesforceTokenResponse;
    if (!response.ok || !body.access_token) {
      throw new CrmProviderHttpError(
        response.status,
        body.error_description || body.error || 'Salesforce OAuth failed',
      );
    }
    return body;
  }

  private tokens(value: SalesforceTokenResponse): CrmOauthTokens {
    if (!value.access_token || !value.instance_url) {
      throw new BadGatewayException('Salesforce OAuth response is incomplete');
    }
    return {
      accessToken: value.access_token,
      refreshToken: value.refresh_token,
      // Salesforce intentionally does not guarantee an access-token expiry.
      // Requests also retry once after a 401 via CrmConnectionsService.
      instanceUrl: value.instance_url,
      identityUrl: value.id,
    };
  }

  private async request<T>(
    url: string,
    accessToken: string,
    init: RequestInit = {},
    acceptedStatuses: number[] = [],
  ): Promise<T> {
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
      throw new ServiceUnavailableException('Salesforce API is unavailable');
    }
    if (acceptedStatuses.includes(response.status) || response.status === 204) {
      return undefined as T;
    }
    const body = (await response.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    if (!response.ok) {
      const errors = Array.isArray(body) ? body : [];
      const first = errors[0] as { message?: string } | undefined;
      throw new CrmProviderHttpError(
        response.status,
        first?.message || `Salesforce API failed with HTTP ${response.status}`,
      );
    }
    return body as T;
  }

  private instanceUrl(value?: string) {
    if (!value)
      throw new BadGatewayException('Salesforce instance URL is missing');
    return value.replace(/\/+$/, '');
  }

  private assertConfigured() {
    if (!this.clientId || !this.clientSecret || !this.redirectUri) {
      throw new ServiceUnavailableException(
        'Salesforce OAuth is not configured',
      );
    }
  }

  private get clientId() {
    return this.config.get<string>('crm.salesforce.clientId') || '';
  }

  private get clientSecret() {
    return this.config.get<string>('crm.salesforce.clientSecret') || '';
  }

  private get loginUrl() {
    return this.config.get<string>(
      'crm.salesforce.loginUrl',
      'https://login.salesforce.com',
    );
  }

  private get redirectUri() {
    return this.config.get<string>('crm.salesforce.redirectUri') || '';
  }

  private get scopes() {
    return this.config.get<string[]>('crm.salesforce.scopes', []);
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
