import {
  BadRequestException,
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

type SalesforceDescribeResponse = {
  fields?: Array<{ name?: string }>;
};

type SalesforceOpportunityCapabilities = {
  fields: Set<string>;
  defaultCurrency: string;
  expiresAt: number;
};

const SALESFORCE_API_VERSION = 'v60.0';
const CAPABILITY_CACHE_TTL_MS = 15 * 60_000;
const OPPORTUNITY_SYNC_FIELDS = [
  'Id',
  'Name',
  'Amount',
  'CurrencyIsoCode',
  'StageName',
  'CloseDate',
  'OwnerId',
  'LastModifiedDate',
  'IsClosed',
  'IsWon',
  'IsDeleted',
];

@Injectable()
export class SalesforceProvider implements CrmProvider {
  readonly provider = IntegrationProvider.SALESFORCE;
  private readonly opportunityCapabilityCache = new Map<
    string,
    SalesforceOpportunityCapabilities
  >();

  constructor(private readonly config: ConfigService) {}

  authorizationUrl(state: string, context: { codeChallenge?: string } = {}) {
    this.assertConfigured();
    if (!context.codeChallenge) {
      throw new ServiceUnavailableException(
        'Salesforce PKCE code challenge is unavailable',
      );
    }
    const url = new URL(`${this.loginUrl}/services/oauth2/authorize`);
    url.search = new URLSearchParams({
      response_type: 'code',
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      state,
      scope: this.scopes.join(' '),
      code_challenge: context.codeChallenge,
      code_challenge_method: 'S256',
    }).toString();
    return url.toString();
  }

  async exchangeCode(
    code: string,
    context: { codeVerifier?: string } = {},
  ): Promise<CrmOauthTokens> {
    if (!context.codeVerifier) {
      throw new ServiceUnavailableException(
        'Salesforce PKCE code verifier is unavailable; restart the connection',
      );
    }
    return this.tokens(
      await this.tokenRequest({
        grant_type: 'authorization_code',
        client_id: this.clientId,
        client_secret: this.clientSecret,
        redirect_uri: this.redirectUri,
        code,
        code_verifier: context.codeVerifier,
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
    const capabilities = await this.opportunityCapabilities(
      accessToken,
      instanceUrl,
    );
    const url = input.cursor
      ? `${instanceUrl}${input.cursor}`
      : `${instanceUrl}/services/data/${SALESFORCE_API_VERSION}/query?${new URLSearchParams(
          {
            q: this.query(input.modifiedSince, capabilities.fields),
          },
        ).toString()}`;
    const page = await this.request<SalesforceQueryResponse>(url, accessToken);
    return {
      items: (page.records || [])
        .map((deal) => this.normalizeDeal(deal, capabilities.defaultCurrency))
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
    const capabilities = await this.opportunityCapabilities(
      accessToken,
      instanceUrl,
    );
    const created = await this.request<{ id?: string; success?: boolean }>(
      `${instanceUrl}/services/data/${SALESFORCE_API_VERSION}/sobjects/Opportunity`,
      accessToken,
      {
        method: 'POST',
        body: JSON.stringify(this.dealBody(input, true, capabilities)),
      },
    );
    if (!created.id || created.success !== true) {
      throw new BadGatewayException('Salesforce did not confirm deal creation');
    }
    return this.fetchDeal(accessToken, instanceUrl, created.id, capabilities);
  }

  async updateDeal(
    accessToken: string,
    externalId: string,
    input: UpdateCrmDealInput & { instanceUrl?: string },
  ): Promise<NormalizedCrmDeal> {
    const instanceUrl = this.instanceUrl(input.instanceUrl);
    const capabilities = await this.opportunityCapabilities(
      accessToken,
      instanceUrl,
    );
    await this.request<void>(
      `${instanceUrl}/services/data/${SALESFORCE_API_VERSION}/sobjects/Opportunity/${encodeURIComponent(externalId)}`,
      accessToken,
      {
        method: 'PATCH',
        body: JSON.stringify(this.dealBody(input, false, capabilities)),
      },
      [204],
    );
    return this.fetchDeal(accessToken, instanceUrl, externalId, capabilities);
  }

  createContact(
    accessToken: string,
    input: CreateCrmContactInput & { instanceUrl?: string },
  ) {
    const [firstName, ...rest] = input.name.trim().split(/\s+/);
    return this.request(
      `${this.instanceUrl(input.instanceUrl)}/services/data/${SALESFORCE_API_VERSION}/sobjects/Contact`,
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
    capabilities: SalesforceOpportunityCapabilities,
  ) {
    const fields = this.queryFields(capabilities.fields).join(',');
    const deal = await this.request<SalesforceOpportunity>(
      `${instanceUrl}/services/data/${SALESFORCE_API_VERSION}/sobjects/Opportunity/${encodeURIComponent(externalId)}?fields=${encodeURIComponent(fields)}`,
      accessToken,
    );
    const normalized = this.normalizeDeal(deal, capabilities.defaultCurrency);
    if (!normalized)
      throw new BadGatewayException('Salesforce returned an invalid deal');
    return normalized;
  }

  private query(modifiedSince: Date | undefined, availableFields: Set<string>) {
    const fields = this.queryFields(availableFields);
    const canFilterByModifiedDate = availableFields.has('LastModifiedDate');
    const where =
      modifiedSince && canFilterByModifiedDate
        ? ` WHERE LastModifiedDate >= ${modifiedSince.toISOString()}`
        : '';
    const orderBy = canFilterByModifiedDate
      ? ' ORDER BY LastModifiedDate ASC'
      : '';
    return `SELECT ${fields.join(',')} FROM Opportunity${where}${orderBy} LIMIT 200`;
  }

  private normalizeDeal(
    value: SalesforceOpportunity,
    defaultCurrency: string,
  ): NormalizedCrmDeal | undefined {
    if (!value.Id) return undefined;
    const stage = value.StageName?.trim() || 'Unknown';
    return {
      externalId: value.Id,
      name: value.Name?.trim() || '(Untitled opportunity)',
      amount: this.number(value.Amount),
      currency: (value.CurrencyIsoCode || defaultCurrency).toUpperCase(),
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
    capabilities: SalesforceOpportunityCapabilities,
  ) {
    const currency = input.currency?.toUpperCase();
    if (
      currency &&
      !capabilities.fields.has('CurrencyIsoCode') &&
      currency !== capabilities.defaultCurrency
    ) {
      throw new BadRequestException(
        `This Salesforce organization uses ${capabilities.defaultCurrency} as its single currency`,
      );
    }
    return {
      ...(input.name !== undefined ? { Name: input.name } : {}),
      ...(input.amount !== undefined ? { Amount: input.amount } : {}),
      ...(currency && capabilities.fields.has('CurrencyIsoCode')
        ? { CurrencyIsoCode: currency }
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

  private queryFields(availableFields: Set<string>) {
    const fields = OPPORTUNITY_SYNC_FIELDS.filter((field) =>
      availableFields.has(field),
    );
    if (!fields.includes('Id')) {
      throw new BadGatewayException(
        'Salesforce Opportunity Id field is not accessible',
      );
    }
    return fields;
  }

  private async opportunityCapabilities(
    accessToken: string,
    instanceUrl: string,
  ) {
    const cached = this.opportunityCapabilityCache.get(instanceUrl);
    if (cached && cached.expiresAt > Date.now()) return cached;

    const describe = await this.request<SalesforceDescribeResponse>(
      `${instanceUrl}/services/data/${SALESFORCE_API_VERSION}/sobjects/Opportunity/describe`,
      accessToken,
    );
    const fields = new Set(
      (describe.fields || [])
        .map((field) => field.name)
        .filter((name): name is string => Boolean(name)),
    );
    this.queryFields(fields);
    const defaultCurrency = await this.defaultCurrency(
      accessToken,
      instanceUrl,
    );
    const capabilities: SalesforceOpportunityCapabilities = {
      fields,
      defaultCurrency,
      expiresAt: Date.now() + CAPABILITY_CACHE_TTL_MS,
    };
    this.opportunityCapabilityCache.set(instanceUrl, capabilities);
    return capabilities;
  }

  private async defaultCurrency(accessToken: string, instanceUrl: string) {
    const envelope = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:urn="urn:partner.soap.sforce.com">
  <soapenv:Header><urn:SessionHeader><urn:sessionId>${this.escapeXml(accessToken)}</urn:sessionId></urn:SessionHeader></soapenv:Header>
  <soapenv:Body><urn:getUserInfo/></soapenv:Body>
</soapenv:Envelope>`;
    let response: Response;
    try {
      response = await fetch(
        `${instanceUrl}/services/Soap/u/${SALESFORCE_API_VERSION.slice(1)}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'text/xml; charset=UTF-8',
            SOAPAction: '""',
          },
          body: envelope,
          signal: AbortSignal.timeout(this.timeoutMs),
        },
      );
    } catch {
      throw new ServiceUnavailableException(
        'Salesforce organization currency lookup is unavailable',
      );
    }
    const body = await response.text();
    if (!response.ok) {
      throw new CrmProviderHttpError(
        response.status,
        this.xmlValue(body, 'faultstring') ||
          'Salesforce organization currency lookup failed',
      );
    }
    const multiCurrency =
      this.xmlValue(body, 'organizationMultiCurrency') === 'true';
    const currency = multiCurrency
      ? this.xmlValue(body, 'userDefaultCurrencyIsoCode')
      : this.xmlValue(body, 'orgDefaultCurrencyIsoCode');
    const fallback =
      currency ||
      this.xmlValue(body, 'orgDefaultCurrencyIsoCode') ||
      this.xmlValue(body, 'userDefaultCurrencyIsoCode');
    if (!fallback || !/^[A-Za-z]{3}$/.test(fallback)) {
      throw new BadGatewayException(
        'Salesforce did not return an organization currency',
      );
    }
    return fallback.toUpperCase();
  }

  private xmlValue(xml: string, element: string) {
    const match = xml.match(
      new RegExp(
        `<(?:[A-Za-z0-9_-]+:)?${element}>([^<]*)<\\/(?:[A-Za-z0-9_-]+:)?${element}>`,
        'i',
      ),
    );
    return match?.[1]?.trim();
  }

  private escapeXml(value: string) {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
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
