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
import type {
  CrmFieldDataType,
  CrmObjectDescriptor,
  CrmObjectField,
  CrmObjectSchema,
  CrmRecordPage,
  ListCrmRecordsInput,
  NormalizedCrmRecord,
} from '../../../common/types/crm-object-sync.interface';
import { IntegrationProvider } from '../../../database/schemas/integration.schema';

type HubSpotObject = {
  id?: string;
  archived?: boolean;
  createdAt?: string;
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

type HubSpotSchemaDefinition = {
  id?: string;
  objectTypeId?: string;
  name?: string;
  fullyQualifiedName?: string;
  archived?: boolean;
  labels?: { singular?: string; plural?: string };
};

type HubSpotSchemasResponse = {
  results?: HubSpotSchemaDefinition[];
};

type HubSpotProperty = {
  name?: string;
  label?: string;
  type?: string;
  fieldType?: string;
  hidden?: boolean;
  archived?: boolean;
  calculated?: boolean;
  hasUniqueValue?: boolean;
  options?: Array<{ label?: string; value?: string; hidden?: boolean }>;
  modificationMetadata?: {
    readOnlyDefinition?: boolean;
    readOnlyValue?: boolean;
  };
};

type HubSpotPropertiesResponse = {
  results?: HubSpotProperty[];
};

const HUBSPOT_STANDARD_LABELS: Record<
  string,
  { singular: string; plural: string }
> = {
  contacts: { singular: 'Contact', plural: 'Contacts' },
  companies: { singular: 'Company', plural: 'Companies' },
  deals: { singular: 'Deal', plural: 'Deals' },
  tickets: { singular: 'Ticket', plural: 'Tickets' },
  leads: { singular: 'Lead', plural: 'Leads' },
  products: { singular: 'Product', plural: 'Products' },
  line_items: { singular: 'Line item', plural: 'Line items' },
  quotes: { singular: 'Quote', plural: 'Quotes' },
  calls: { singular: 'Call', plural: 'Calls' },
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

  async listObjects(
    accessToken: string,
    context: { scopes?: string[] } = {},
  ): Promise<CrmObjectDescriptor[]> {
    const scopes = this.effectiveScopes(context.scopes);
    const objects = new Map<string, CrmObjectDescriptor>();

    for (const scope of scopes) {
      const match = scope.match(/^crm\.objects\.([a-z0-9_]+)\.read$/i);
      const objectType = match?.[1]?.toLowerCase();
      if (!objectType || objectType === 'custom') continue;
      const labels = this.standardLabels(objectType);
      const writeScope = `crm.objects.${objectType}.write`;
      objects.set(objectType, {
        objectType,
        label: labels.singular,
        pluralLabel: labels.plural,
        custom: false,
        readable: true,
        createable: scopes.has(writeScope),
        updateable: scopes.has(writeScope),
        deletable: scopes.has(writeScope),
      });
    }

    if (scopes.has('crm.schemas.custom.read')) {
      const response = await this.request<HubSpotSchemasResponse>(
        'https://api.hubapi.com/crm/v3/schemas',
        accessToken,
      );
      const readable = scopes.has('crm.objects.custom.read');
      const writable = scopes.has('crm.objects.custom.write');
      for (const schema of response.results || []) {
        if (schema.archived) continue;
        const objectType = this.customObjectType(schema);
        if (!objectType) continue;
        objects.set(objectType, {
          objectType,
          label: schema.labels?.singular || schema.name || objectType,
          pluralLabel:
            schema.labels?.plural || schema.labels?.singular || objectType,
          custom: true,
          readable,
          createable: writable,
          updateable: writable,
          deletable: writable,
        });
      }
    }

    return [...objects.values()].sort((left, right) =>
      left.label.localeCompare(right.label),
    );
  }

  async describeObject(
    accessToken: string,
    objectType: string,
    context: { scopes?: string[] } = {},
  ): Promise<CrmObjectSchema> {
    const scopes = this.effectiveScopes(context.scopes);
    const custom = this.isCustomObjectType(objectType);
    const properties = await this.request<HubSpotPropertiesResponse>(
      `https://api.hubapi.com/crm/v3/properties/${encodeURIComponent(objectType)}?archived=false`,
      accessToken,
    );
    const customSchema = custom
      ? await this.customSchema(accessToken, objectType, scopes)
      : undefined;
    const defaultLabels = this.standardLabels(objectType);
    const label =
      customSchema?.labels?.singular?.trim() || defaultLabels.singular;
    const pluralLabel =
      customSchema?.labels?.plural?.trim() || defaultLabels.plural;
    const readableScope = custom
      ? 'crm.objects.custom.read'
      : `crm.objects.${objectType}.read`;
    const writeScope = custom
      ? 'crm.objects.custom.write'
      : `crm.objects.${objectType}.write`;

    return {
      objectType,
      label,
      pluralLabel,
      custom,
      readable: scopes.has(readableScope),
      createable: scopes.has(writeScope),
      updateable: scopes.has(writeScope),
      deletable: scopes.has(writeScope),
      fields: (properties.results || [])
        .filter((property) => !property.archived && Boolean(property.name))
        .map((property) => this.objectField(property))
        .sort((left, right) => left.label.localeCompare(right.label)),
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

  async listRecords(
    accessToken: string,
    input: ListCrmRecordsInput,
  ): Promise<CrmRecordPage> {
    const body: Record<string, unknown> = {
      limit: 100,
      properties: input.fields,
      sorts: ['hs_lastmodifieddate'],
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
      `https://api.hubapi.com/crm/v3/objects/${encodeURIComponent(input.objectType)}/search`,
      accessToken,
      { method: 'POST', body: JSON.stringify(body) },
    );
    return {
      provider: this.provider,
      objectType: input.objectType,
      items: (page.results || [])
        .map((record) => this.normalizeRecord(input, record))
        .filter((record): record is NormalizedCrmRecord => Boolean(record)),
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

  private normalizeRecord(
    input: ListCrmRecordsInput,
    value: HubSpotObject,
  ): NormalizedCrmRecord | undefined {
    if (!value.id) return undefined;
    const source = value.properties || {};
    const properties = Object.fromEntries(
      input.fields.map((field) => [field, source[field] ?? null]),
    );
    return {
      objectType: input.objectType,
      externalId: value.id,
      properties,
      providerCreatedAt: this.date(value.createdAt),
      providerUpdatedAt: this.date(
        value.updatedAt || source.hs_lastmodifieddate,
      ),
      archived: value.archived === true,
      rawPayload: value as Record<string, unknown>,
    };
  }

  private objectField(property: HubSpotProperty): CrmObjectField {
    const providerType = property.type || property.fieldType || 'unknown';
    const readOnly = property.modificationMetadata?.readOnlyValue === true;
    const calculated = property.calculated === true;
    return {
      name: property.name!,
      label: property.label?.trim() || property.name!,
      dataType: this.fieldDataType(providerType),
      providerType,
      custom: property.modificationMetadata?.readOnlyDefinition === false,
      required: false,
      readable: property.hidden !== true,
      createable: !readOnly && !calculated,
      updateable: !readOnly && !calculated,
      filterable: property.hidden !== true,
      sortable: property.hidden !== true,
      unique: property.hasUniqueValue === true,
      calculated,
      referenceTo: [],
      options: (property.options || [])
        .filter((option) => option.value !== undefined)
        .map((option) => ({
          label: option.label || option.value!,
          value: option.value!,
          active: option.hidden !== true,
        })),
    };
  }

  private fieldDataType(providerType: string): CrmFieldDataType {
    switch (providerType.toLowerCase()) {
      case 'number':
        return 'NUMBER';
      case 'bool':
      case 'boolean':
        return 'BOOLEAN';
      case 'date':
        return 'DATE';
      case 'datetime':
        return 'DATETIME';
      case 'enumeration':
        return 'ENUMERATION';
      case 'string':
      case 'phone_number':
        return 'STRING';
      default:
        return 'OTHER';
    }
  }

  private effectiveScopes(scopes?: string[]) {
    return new Set(scopes?.length ? scopes : this.scopes);
  }

  private standardLabels(objectType: string) {
    return (
      HUBSPOT_STANDARD_LABELS[objectType] || {
        singular: this.humanize(objectType),
        plural: this.humanize(objectType),
      }
    );
  }

  private humanize(value: string) {
    const label = value.replace(/_/g, ' ').trim();
    return label ? `${label[0].toUpperCase()}${label.slice(1)}` : value;
  }

  private customObjectType(schema: HubSpotSchemaDefinition) {
    return (
      this.string(schema.objectTypeId) ||
      this.string(schema.fullyQualifiedName) ||
      this.string(schema.id)
    );
  }

  private isCustomObjectType(objectType: string) {
    return /^(?:2-\d+|p(?:\d+)?_[a-z0-9_]+)$/i.test(objectType);
  }

  private async customSchema(
    accessToken: string,
    objectType: string,
    scopes: Set<string>,
  ) {
    if (!scopes.has('crm.schemas.custom.read')) return undefined;
    try {
      return await this.request<HubSpotSchemaDefinition>(
        `https://api.hubapi.com/crm/v3/schemas/${encodeURIComponent(objectType)}`,
        accessToken,
      );
    } catch (error) {
      if (error instanceof CrmProviderHttpError && error.statusCode === 404) {
        return undefined;
      }
      throw error;
    }
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
