import {
  BadRequestException,
  ConflictException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CrmConnectionMetadata,
  CrmProviderHttpError,
  CrmProviderType,
} from '../../common/types/crm-provider.interface';
import { decryptText, encryptText } from '../../common/helpers/crypto.helper';
import { Integration } from '../../database/schemas/integration.schema';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { IntegrationOAuthStateService } from '../integrations/integration-oauth-state.service';
import { CrmProviderRegistry } from './crm-provider.registry';
import { CrmRepository } from './crm.repository';

type StoredConnection = Integration & { _id?: unknown };

@Injectable()
export class CrmConnectionsService {
  constructor(
    private readonly repository: CrmRepository,
    private readonly providers: CrmProviderRegistry,
    private readonly oauthStates: IntegrationOAuthStateService,
    private readonly auditLogs: AuditLogsService,
    private readonly config: ConfigService,
  ) {}

  async connectUrl(
    organizationId: string,
    userId: string,
    provider: CrmProviderType,
  ) {
    const state = await this.oauthStates.create({
      provider,
      organizationId,
      userId,
    });
    return {
      authorizationUrl: this.providers.get(provider).authorizationUrl(state),
    };
  }

  async complete(provider: CrmProviderType, code: string, state: string) {
    const context = await this.oauthStates.consume(state, provider);
    const client = this.providers.get(provider);
    const existing = (await this.repository.find(
      context.organizationId,
      provider,
    )) as StoredConnection | null;
    const tokens = await client.exchangeCode(code);
    const refreshToken =
      tokens.refreshToken ||
      (existing?.refreshToken
        ? decryptText(existing.refreshToken, this.encryptionKey)
        : undefined);
    if (!refreshToken) {
      throw new BadRequestException(
        'The CRM did not grant a refresh token; revoke the previous grant and reconnect',
      );
    }
    const profile = await client.getProfile(tokens.accessToken, {
      instanceUrl: tokens.instanceUrl,
      identityUrl: tokens.identityUrl,
      providerAccountId: tokens.providerAccountId,
    });
    const metadata: CrmConnectionMetadata = {
      ...this.metadata(existing),
      connectedByUserId: context.userId,
      providerAccountId: profile.id,
      providerEmail: profile.email,
      providerName: profile.name,
      providerOrganizationId: profile.organizationId,
      ...(tokens.instanceUrl ? { instanceUrl: tokens.instanceUrl } : {}),
      scopes: tokens.scopes || this.metadata(existing).scopes || [],
      reconnectRequired: false,
      syncStatus: 'IDLE',
      lastSyncError: undefined,
    };
    await this.repository.upsert(context.organizationId, provider, {
      status: 'CONNECTED',
      accessToken: encryptText(tokens.accessToken, this.encryptionKey),
      refreshToken: encryptText(refreshToken, this.encryptionKey),
      ...(tokens.expiresIn
        ? { expiresAt: new Date(Date.now() + tokens.expiresIn * 1000) }
        : { expiresAt: undefined }),
      metadata,
    });
    await this.repository.ensureDefault(context.organizationId);
    await this.auditLogs.create({
      organizationId: context.organizationId,
      userId: context.userId,
      action: 'CRM_CONNECTED',
      resourceType: 'integration',
      resourceId: provider,
      metadata: { provider, providerAccountId: profile.id },
    });
    return { connected: true, provider };
  }

  async disconnect(
    organizationId: string,
    userId: string,
    provider: CrmProviderType,
  ) {
    const current = (await this.repository.find(
      organizationId,
      provider,
    )) as StoredConnection | null;
    if (!current) return { provider, connected: false };
    const token = current.refreshToken || current.accessToken;
    if (token) {
      await this.providers
        .get(provider)
        .revokeToken?.(decryptText(token, this.encryptionKey), {
          instanceUrl: this.metadata(current).instanceUrl,
        })
        .catch(() => undefined);
    }
    await this.repository.disconnect(organizationId, provider);
    await this.auditLogs.create({
      organizationId,
      userId,
      action: 'CRM_DISCONNECTED',
      resourceType: 'integration',
      resourceId: provider,
      metadata: { provider },
    });
    return { provider, connected: false, disconnected: true };
  }

  async setDefault(
    organizationId: string,
    userId: string,
    provider: CrmProviderType,
  ) {
    const saved = await this.repository.setDefault(organizationId, provider);
    await this.auditLogs.create({
      organizationId,
      userId,
      action: 'CRM_DEFAULT_CHANGED',
      resourceType: 'integration',
      resourceId: provider,
      metadata: { provider },
    });
    return this.connectionResponse(saved as StoredConnection);
  }

  async connection(organizationId: string, provider: CrmProviderType) {
    const saved = (await this.repository.find(
      organizationId,
      provider,
    )) as StoredConnection | null;
    return saved
      ? this.connectionResponse(saved)
      : { provider, connected: false, status: 'NOT_CONFIGURED' };
  }

  async resolve(organizationId: string, requested?: CrmProviderType) {
    const connection = (
      requested
        ? await this.repository.findConnected(organizationId, requested)
        : await this.repository.findDefaultConnected(organizationId)
    ) as StoredConnection | null;
    if (!connection) {
      throw new ServiceUnavailableException(
        requested
          ? `Connect ${requested} before using it`
          : 'Connect and select a default CRM before using CRM features',
      );
    }
    return connection;
  }

  async execute<T>(
    organizationId: string,
    provider: CrmProviderType | undefined,
    operation: (input: {
      provider: CrmProviderType;
      accessToken: string;
      metadata: CrmConnectionMetadata;
    }) => Promise<T>,
  ): Promise<T> {
    const connection = await this.resolve(organizationId, provider);
    const resolvedProvider = connection.provider as CrmProviderType;
    const metadata = this.metadata(connection);
    let accessToken = await this.validAccessToken(connection, resolvedProvider);
    try {
      return await operation({
        provider: resolvedProvider,
        accessToken,
        metadata,
      });
    } catch (error) {
      if (
        !(error instanceof CrmProviderHttpError) ||
        error.statusCode !== 401
      ) {
        throw error;
      }
      accessToken = await this.refresh(connection, resolvedProvider);
      try {
        return await operation({
          provider: resolvedProvider,
          accessToken,
          metadata,
        });
      } catch (retryError) {
        if (
          retryError instanceof CrmProviderHttpError &&
          retryError.statusCode === 401
        ) {
          await this.markReconnectRequired(
            connection,
            resolvedProvider,
            'Provider rejected the refreshed access token',
          );
        }
        throw retryError;
      }
    }
  }

  callbackUrl(provider: CrmProviderType, connected: boolean, error?: string) {
    const url = new URL(
      this.config.get<string>(
        'integrations.frontendUrl',
        'http://localhost:3000/dashboard/integrations',
      ),
    );
    url.searchParams.set('provider', provider.toLowerCase());
    url.searchParams.set('connection', connected ? 'success' : 'failed');
    if (error) url.searchParams.set('error', error.slice(0, 120));
    return url.toString();
  }

  private async validAccessToken(
    connection: StoredConnection,
    provider: CrmProviderType,
  ) {
    if (
      connection.accessToken &&
      (!connection.expiresAt ||
        new Date(connection.expiresAt).getTime() > Date.now() + 60_000)
    ) {
      return decryptText(connection.accessToken, this.encryptionKey);
    }
    return this.refresh(connection, provider);
  }

  private async refresh(
    connection: StoredConnection,
    provider: CrmProviderType,
  ) {
    if (!connection.refreshToken) {
      await this.markReconnectRequired(
        connection,
        provider,
        'Refresh token is unavailable',
      );
      throw new ServiceUnavailableException(
        'The CRM connection must be reconnected',
      );
    }
    try {
      const tokens = await this.providers
        .get(provider)
        .refreshAccessToken(
          decryptText(connection.refreshToken, this.encryptionKey),
        );
      const metadata = {
        ...this.metadata(connection),
        ...(tokens.instanceUrl ? { instanceUrl: tokens.instanceUrl } : {}),
        ...(tokens.scopes ? { scopes: tokens.scopes } : {}),
        reconnectRequired: false,
      } satisfies CrmConnectionMetadata;
      await this.repository.update(connection.organizationId, provider, {
        status: 'CONNECTED',
        accessToken: encryptText(tokens.accessToken, this.encryptionKey),
        ...(tokens.refreshToken
          ? {
              refreshToken: encryptText(
                tokens.refreshToken,
                this.encryptionKey,
              ),
            }
          : {}),
        ...(tokens.expiresIn
          ? { expiresAt: new Date(Date.now() + tokens.expiresIn * 1000) }
          : {}),
        metadata,
      });
      return tokens.accessToken;
    } catch (error) {
      const requiresReconnect =
        error instanceof CrmProviderHttpError &&
        [400, 401, 403].includes(error.statusCode);

      if (requiresReconnect) {
        await this.markReconnectRequired(connection, provider, error.message);
        throw new ServiceUnavailableException(
          'The CRM connection must be reconnected',
        );
      }

      if (error instanceof ServiceUnavailableException) {
        throw error;
      }

      throw new ServiceUnavailableException('CRM token refresh is unavailable');
    }
  }

  private async markReconnectRequired(
    connection: StoredConnection,
    provider: CrmProviderType,
    message: string,
  ) {
    await this.repository.update(connection.organizationId, provider, {
      status: 'FAILED',
      metadata: {
        ...this.metadata(connection),
        reconnectRequired: true,
        syncStatus: 'FAILED',
        lastSyncError: message.slice(0, 1000),
      } satisfies CrmConnectionMetadata,
    });
  }

  private metadata(
    connection?: StoredConnection | null,
  ): CrmConnectionMetadata {
    return (connection?.metadata || {}) as CrmConnectionMetadata;
  }

  private connectionResponse(connection: StoredConnection) {
    const metadata = this.metadata(connection);
    return {
      provider: connection.provider,
      connected: connection.status === 'CONNECTED',
      status: connection.status,
      isDefault: connection.isDefaultCrm === true,
      account: {
        id: metadata.providerAccountId,
        email: metadata.providerEmail,
        name: metadata.providerName,
      },
      connectedByUserId: metadata.connectedByUserId,
      expiresAt: connection.expiresAt,
      lastSyncedAt: metadata.lastSyncedAt,
      syncStatus: metadata.syncStatus || 'IDLE',
      lastSyncError: metadata.lastSyncError,
      reconnectRequired: metadata.reconnectRequired === true,
    };
  }

  private get encryptionKey() {
    const key = this.config.getOrThrow<string>('integrations.encryptionKey');
    if (key.length < 32) {
      throw new ConflictException('CRM encryption is not configured');
    }
    return key;
  }
}
