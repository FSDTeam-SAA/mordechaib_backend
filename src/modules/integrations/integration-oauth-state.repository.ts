import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { IntegrationOAuthState } from '../../database/schemas/integration-oauth-state.schema';

@Injectable()
export class IntegrationOAuthStateRepository {
  constructor(
    @InjectModel(IntegrationOAuthState.name)
    private readonly states: Model<IntegrationOAuthState>,
  ) {}

  create(input: {
    nonceHash: string;
    provider: string;
    organizationId: string;
    userId: string;
    expiresAt: Date;
  }) {
    return this.states.create(input);
  }

  consume(nonceHash: string, provider: string, now: Date) {
    return this.states
      .findOneAndUpdate(
        {
          nonceHash,
          provider,
          expiresAt: { $gt: now },
          consumedAt: { $exists: false },
        },
        { $set: { consumedAt: now } },
        { new: true },
      )
      .lean()
      .exec();
  }
}
