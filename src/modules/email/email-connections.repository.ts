import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { EmailProvider } from '../../common/enums/email-provider.enum';
import { EmailConnection } from '../../database/schemas/email-connection.schema';
import { EmailOAuthState } from '../../database/schemas/email-oauth-state.schema';

@Injectable()
export class EmailConnectionsRepository {
  constructor(
    @InjectModel(EmailConnection.name)
    private readonly connections: Model<EmailConnection>,
    @InjectModel(EmailOAuthState.name)
    private readonly states: Model<EmailOAuthState>,
  ) {}

  createState(input: {
    nonceHash: string;
    provider: EmailProvider;
    organizationId: string;
    userId: string;
    expiresAt: Date;
  }) {
    return this.states.create(input);
  }

  consumeState(nonceHash: string, provider: EmailProvider) {
    const now = new Date();
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

  find(organizationId: string, userId: string, provider: EmailProvider) {
    return this.connections
      .findOne({ organizationId, userId, provider })
      .select('+accessToken +refreshToken')
      .lean()
      .exec();
  }

  list(organizationId: string, userId: string) {
    return this.connections
      .find({ organizationId, userId })
      .select('-accessToken -refreshToken')
      .lean()
      .exec();
  }

  upsert(
    organizationId: string,
    userId: string,
    provider: EmailProvider,
    values: Record<string, unknown>,
  ) {
    return this.connections
      .findOneAndUpdate(
        { organizationId, userId, provider },
        { $set: values, $unset: { disconnectedAt: 1 } },
        { upsert: true, new: true, runValidators: true },
      )
      .lean()
      .exec();
  }

  updateTokens(
    organizationId: string,
    userId: string,
    provider: EmailProvider,
    values: { accessToken: string; refreshToken?: string; expiresAt?: Date },
  ) {
    return this.connections
      .updateOne(
        { organizationId, userId, provider, status: 'CONNECTED' },
        { $set: values },
      )
      .exec();
  }

  disconnect(organizationId: string, userId: string, provider: EmailProvider) {
    return this.connections
      .findOneAndUpdate(
        { organizationId, userId, provider },
        {
          $set: { status: 'DISCONNECTED', disconnectedAt: new Date() },
          $unset: { accessToken: 1, refreshToken: 1, expiresAt: 1 },
        },
        { new: true },
      )
      .lean()
      .exec();
  }
}
