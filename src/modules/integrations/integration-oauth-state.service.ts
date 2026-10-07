import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import crypto from 'crypto';
import { decryptText, encryptText } from '../../common/helpers/crypto.helper';
import { IntegrationOAuthStateRepository } from './integration-oauth-state.repository';

@Injectable()
export class IntegrationOAuthStateService {
  private readonly lifetimeMs = 10 * 60_000;

  constructor(
    private readonly repository: IntegrationOAuthStateRepository,
    private readonly config: ConfigService,
  ) {}

  async create(input: {
    provider: string;
    organizationId: string;
    userId: string;
    usePkce?: boolean;
  }) {
    const state = crypto.randomBytes(32).toString('base64url');
    const codeVerifier = input.usePkce
      ? crypto.randomBytes(64).toString('base64url')
      : undefined;
    await this.repository.create({
      nonceHash: this.hash(state),
      provider: input.provider,
      organizationId: input.organizationId,
      userId: input.userId,
      ...(codeVerifier
        ? {
            codeVerifierEncrypted: encryptText(
              codeVerifier,
              this.encryptionKey,
            ),
          }
        : {}),
      expiresAt: new Date(Date.now() + this.lifetimeMs),
    });
    return {
      state,
      ...(codeVerifier
        ? { codeChallenge: this.codeChallenge(codeVerifier) }
        : {}),
    };
  }

  async consume(state: string, provider: string) {
    if (!state || state.length > 200) {
      throw new UnauthorizedException('Integration OAuth state is invalid');
    }
    const consumed = await this.repository.consume(
      this.hash(state),
      provider,
      new Date(),
    );
    if (!consumed) {
      throw new UnauthorizedException(
        'Integration OAuth state is invalid, expired, or already used',
      );
    }
    return {
      organizationId: consumed.organizationId,
      userId: consumed.userId,
      ...(consumed.codeVerifierEncrypted
        ? {
            codeVerifier: decryptText(
              consumed.codeVerifierEncrypted,
              this.encryptionKey,
            ),
          }
        : {}),
    };
  }

  private codeChallenge(codeVerifier: string) {
    return crypto.createHash('sha256').update(codeVerifier).digest('base64url');
  }

  private hash(value: string) {
    return crypto.createHash('sha256').update(value).digest('hex');
  }

  private get encryptionKey() {
    const key = this.config.getOrThrow<string>('integrations.encryptionKey');
    if (key.length < 32) {
      throw new ConflictException('Integration encryption is not configured');
    }
    return key;
  }
}
