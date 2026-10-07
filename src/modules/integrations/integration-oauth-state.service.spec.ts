import { ConfigService } from '@nestjs/config';
import crypto from 'crypto';
import { decryptText } from '../../common/helpers/crypto.helper';
import { IntegrationOAuthStateRepository } from './integration-oauth-state.repository';
import { IntegrationOAuthStateService } from './integration-oauth-state.service';

describe('IntegrationOAuthStateService', () => {
  const encryptionKey = '12345678901234567890123456789012';
  const repository = {
    create: jest.fn(),
    consume: jest.fn(),
  };
  const service = new IntegrationOAuthStateService(
    repository as unknown as IntegrationOAuthStateRepository,
    {
      getOrThrow: jest.fn(() => encryptionKey),
    } as unknown as ConfigService,
  );

  beforeEach(() => jest.clearAllMocks());

  it('creates and consumes an encrypted PKCE verifier', async () => {
    let saved: Record<string, unknown> = {};
    repository.create.mockImplementation(async (input) => {
      saved = input;
      return input;
    });

    const created = await service.create({
      provider: 'SALESFORCE',
      organizationId: 'org-1',
      userId: 'user-1',
      usePkce: true,
    });
    const encrypted = String(saved.codeVerifierEncrypted);
    const verifier = decryptText(encrypted, encryptionKey);
    const expectedChallenge = crypto
      .createHash('sha256')
      .update(verifier)
      .digest('base64url');

    expect(created.codeChallenge).toBe(expectedChallenge);
    expect(encrypted).not.toContain(verifier);

    repository.consume.mockResolvedValue({
      organizationId: 'org-1',
      userId: 'user-1',
      codeVerifierEncrypted: encrypted,
    });
    await expect(service.consume(created.state, 'SALESFORCE')).resolves.toEqual(
      {
        organizationId: 'org-1',
        userId: 'user-1',
        codeVerifier: verifier,
      },
    );
  });
});
