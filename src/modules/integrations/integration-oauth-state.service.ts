import { Injectable, UnauthorizedException } from '@nestjs/common';
import crypto from 'crypto';
import { IntegrationOAuthStateRepository } from './integration-oauth-state.repository';

@Injectable()
export class IntegrationOAuthStateService {
  private readonly lifetimeMs = 10 * 60_000;

  constructor(private readonly repository: IntegrationOAuthStateRepository) {}

  async create(input: {
    provider: string;
    organizationId: string;
    userId: string;
  }) {
    const state = crypto.randomBytes(32).toString('base64url');
    await this.repository.create({
      nonceHash: this.hash(state),
      provider: input.provider,
      organizationId: input.organizationId,
      userId: input.userId,
      expiresAt: new Date(Date.now() + this.lifetimeMs),
    });
    return state;
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
    };
  }

  private hash(value: string) {
    return crypto.createHash('sha256').update(value).digest('hex');
  }
}
