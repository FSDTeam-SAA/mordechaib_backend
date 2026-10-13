import { ConfigService } from '@nestjs/config';
import { encryptText } from '../../common/helpers/crypto.helper';
import { IntegrationProvider } from '../../database/schemas/integration.schema';
import { MetaRepository } from './meta.repository';
import { MetaService } from './meta.service';
import { MetaProvider } from './providers/meta.provider';

describe('MetaService', () => {
  const encryptionKey = '12345678901234567890123456789012';

  function createService(connection: Record<string, unknown> | null) {
    const repository = {
      findByOrganizationWithAccessToken: jest
        .fn()
        .mockResolvedValue(connection),
      disconnect: jest.fn().mockResolvedValue({ status: 'DISCONNECTED' }),
    };
    const provider = {
      revokePermissions: jest.fn().mockResolvedValue({ success: true }),
    };
    const config = {
      getOrThrow: jest.fn((key: string) => {
        if (key === 'meta.encryptionKey') return encryptionKey;
        throw new Error(`Unexpected config key: ${key}`);
      }),
    };

    return {
      service: new MetaService(
        repository as unknown as MetaRepository,
        provider as unknown as MetaProvider,
        config as unknown as ConfigService,
      ),
      repository,
      provider,
    };
  }

  it('revokes provider permissions and removes the local connection secrets', async () => {
    const { service, repository, provider } = createService({
      status: 'CONNECTED',
      accessToken: encryptText('plain-meta-token', encryptionKey),
    });

    await expect(service.disconnect('org-1')).resolves.toEqual({
      provider: IntegrationProvider.META,
      connected: false,
      disconnected: true,
    });
    expect(provider.revokePermissions).toHaveBeenCalledWith(
      'plain-meta-token',
    );
    expect(repository.disconnect).toHaveBeenCalledWith('org-1');
  });

  it('is idempotent when no Meta connection exists', async () => {
    const { service, repository, provider } = createService(null);

    await expect(service.disconnect('org-1')).resolves.toEqual({
      provider: IntegrationProvider.META,
      connected: false,
      disconnected: false,
    });
    expect(provider.revokePermissions).not.toHaveBeenCalled();
    expect(repository.disconnect).not.toHaveBeenCalled();
  });

  it('still clears local credentials when provider revocation fails', async () => {
    const { service, repository, provider } = createService({
      status: 'CONNECTED',
      accessToken: encryptText('plain-meta-token', encryptionKey),
    });
    provider.revokePermissions.mockRejectedValueOnce(
      new Error('Meta is unavailable'),
    );

    await expect(service.disconnect('org-1')).resolves.toEqual(
      expect.objectContaining({ connected: false, disconnected: true }),
    );
    expect(repository.disconnect).toHaveBeenCalledWith('org-1');
  });
});
