import { IntegrationProvider } from '../../database/schemas/integration.schema';

export type CrmProviderType =
  IntegrationProvider.HUBSPOT | IntegrationProvider.SALESFORCE;

export type CrmOauthTokens = {
  accessToken: string;
  refreshToken?: string;
  expiresIn?: number;
  scopes?: string[];
  instanceUrl?: string;
  identityUrl?: string;
  providerAccountId?: string;
};

export type CrmAccountProfile = {
  id: string;
  name?: string;
  email?: string;
  organizationId?: string;
};

export type CrmDealStageCategory = 'OPEN' | 'WON' | 'LOST';

export type NormalizedCrmDeal = {
  externalId: string;
  name: string;
  amount: number;
  currency: string;
  providerStage: string;
  stageCategory: CrmDealStageCategory;
  closeDate?: Date;
  ownerId?: string;
  ownerName?: string;
  archived: boolean;
  providerUpdatedAt?: Date;
  rawPayload: Record<string, unknown>;
};

export type CrmDealPage = {
  items: NormalizedCrmDeal[];
  cursor?: string;
  done: boolean;
};

export type CreateCrmContactInput = {
  name: string;
  email: string;
  phone?: string;
};

export type CreateCrmDealInput = {
  name: string;
  amount?: number;
  currency?: string;
  providerStage?: string;
  closeDate?: Date;
  ownerId?: string;
};

export type UpdateCrmDealInput = Partial<CreateCrmDealInput> & {
  archived?: boolean;
};

export type CrmConnectionMetadata = {
  connectedByUserId?: string;
  providerAccountId?: string;
  providerEmail?: string;
  providerName?: string;
  providerOrganizationId?: string;
  instanceUrl?: string;
  scopes?: string[];
  syncCursor?: string;
  syncSince?: string;
  syncStartedAt?: string;
  lastSyncedAt?: string;
  syncStatus?: 'IDLE' | 'SYNCING' | 'FAILED';
  lastSyncError?: string;
  reconnectRequired?: boolean;
  [key: string]: unknown;
};

export class CrmProviderHttpError extends Error {
  constructor(
    readonly statusCode: number,
    message: string,
  ) {
    super(message);
  }
}

export interface CrmProvider {
  readonly provider: CrmProviderType;
  authorizationUrl(state: string): string;
  exchangeCode(code: string): Promise<CrmOauthTokens>;
  refreshAccessToken(refreshToken: string): Promise<CrmOauthTokens>;
  getProfile(
    accessToken: string,
    context?: {
      instanceUrl?: string;
      identityUrl?: string;
      providerAccountId?: string;
    },
  ): Promise<CrmAccountProfile>;
  listDeals(
    accessToken: string,
    input: { cursor?: string; modifiedSince?: Date; instanceUrl?: string },
  ): Promise<CrmDealPage>;
  createDeal(
    accessToken: string,
    input: CreateCrmDealInput & { instanceUrl?: string },
  ): Promise<NormalizedCrmDeal>;
  updateDeal(
    accessToken: string,
    externalId: string,
    input: UpdateCrmDealInput & { instanceUrl?: string },
  ): Promise<NormalizedCrmDeal>;
  createContact(
    accessToken: string,
    input: CreateCrmContactInput & { instanceUrl?: string },
  ): Promise<unknown>;
  revokeToken?(
    token: string,
    context?: { instanceUrl?: string },
  ): Promise<void>;
}
