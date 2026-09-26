import { ConfigService } from '@nestjs/config';
import { CrmProviderHttpError } from '../../common/types/crm-provider.interface';
import { encryptText } from '../../common/helpers/crypto.helper';
import { IntegrationProvider } from '../../database/schemas/integration.schema';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { IntegrationOAuthStateService } from '../integrations/integration-oauth-state.service';
import { CrmConnectionsService } from './crm-connections.service';
import { CrmProviderRegistry } from './crm-provider.registry';
import { CrmRepository } from './crm.repository';

describe('CrmConnectionsService', () => {
  const encryptionKey = '12345678901234567890123456789012';
  const repository = {
    findDefaultConnected: jest.fn(),
    findConnected: jest.fn(),
    update: jest.fn(),
    find: jest.fn(),
    upsert: jest.fn(),
    ensureDefault: jest.fn(),
    disconnect: jest.fn(),
    setDefault: jest.fn(),
  };
  const provider = {
    refreshAccessToken: jest.fn(),
    exchangeCode: jest.fn(),
    getProfile: jest.fn(),
    authorizationUrl: jest.fn(),
  };
  const providers = { get: jest.fn(() => provider) };
  const oauthStates = { create: jest.fn(), consume: jest.fn() };
  const audits = { create: jest.fn() };
  const config = {
    getOrThrow: jest.fn(() => encryptionKey),
    get: jest.fn((_key: string, fallback?: string) => fallback),
  };
  const service = new CrmConnectionsService(
    repository as unknown as CrmRepository,
    providers as unknown as CrmProviderRegistry,
    oauthStates as unknown as IntegrationOAuthStateService,
    audits as unknown as AuditLogsService,
    config as unknown as ConfigService,
  );

  const defaultConnection = {
    organizationId: 'org-1',
    provider: IntegrationProvider.HUBSPOT,
    status: 'CONNECTED',
    accessToken: encryptText('current-token', encryptionKey),
    refreshToken: encryptText('refresh-token', encryptionKey),
    metadata: { providerAccountId: 'hub-1' },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    repository.findDefaultConnected.mockResolvedValue(defaultConnection);
    repository.update.mockResolvedValue(defaultConnection);
  });

  it('uses the organization default when no provider is requested', async () => {
    const operation = jest.fn().mockResolvedValue({ ok: true });

    await expect(
      service.execute('org-1', undefined, operation),
    ).resolves.toEqual({
      ok: true,
    });

    expect(repository.findDefaultConnected).toHaveBeenCalledWith('org-1');
    expect(operation).toHaveBeenCalledWith({
      provider: IntegrationProvider.HUBSPOT,
      accessToken: 'current-token',
      metadata: { providerAccountId: 'hub-1' },
    });
  });

  it('refreshes once and retries a provider request after a 401', async () => {
    provider.refreshAccessToken.mockResolvedValue({
      accessToken: 'refreshed-token',
      expiresIn: 1800,
    });
    const operation = jest
      .fn()
      .mockRejectedValueOnce(new CrmProviderHttpError(401, 'expired'))
      .mockResolvedValueOnce({ ok: true });

    await expect(
      service.execute('org-1', undefined, operation),
    ).resolves.toEqual({
      ok: true,
    });

    expect(provider.refreshAccessToken).toHaveBeenCalledWith('refresh-token');
    expect(operation).toHaveBeenLastCalledWith({
      provider: IntegrationProvider.HUBSPOT,
      accessToken: 'refreshed-token',
      metadata: { providerAccountId: 'hub-1' },
    });
    expect(repository.update).toHaveBeenCalledWith(
      'org-1',
      IntegrationProvider.HUBSPOT,
      expect.objectContaining({ status: 'CONNECTED' }),
    );
  });
});
