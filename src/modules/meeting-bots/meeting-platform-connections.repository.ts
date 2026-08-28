import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { MeetingPlatform } from '../../common/enums/meeting-platform.enum';
import {
  Integration,
  IntegrationProvider,
} from '../../database/schemas/integration.schema';

export type MeetingConnectionMetadata = {
  connectedByUserId?: string;
  providerAccountId?: string;
  providerEmail?: string;
  providerName?: string;
  recallCredentialId?: string;
  recallOAuthAppId?: string;
  scopes?: string[];
  [key: string]: unknown;
};

@Injectable()
export class MeetingPlatformConnectionsRepository {
  constructor(
    @InjectModel(Integration.name)
    private readonly integrationModel: Model<Integration>,
  ) {}

  find(organizationId: string, platform: MeetingPlatform) {
    return this.integrationModel
      .findOne({ organizationId, provider: this.providerFor(platform) })
      .select('+accessToken +refreshToken')
      .lean()
      .exec();
  }

  findConnected(organizationId: string, platform: MeetingPlatform) {
    return this.integrationModel
      .findOne({
        organizationId,
        provider: this.providerFor(platform),
        status: 'CONNECTED',
      })
      .select('+accessToken +refreshToken')
      .lean()
      .exec();
  }

  upsert(
    organizationId: string,
    platform: MeetingPlatform,
    input: Partial<Integration>,
  ) {
    return this.integrationModel
      .findOneAndUpdate(
        { organizationId, provider: this.providerFor(platform) },
        {
          $set: {
            ...input,
            organizationId,
            provider: this.providerFor(platform),
          },
        },
        { new: true, upsert: true, runValidators: true },
      )
      .lean()
      .exec();
  }

  disconnect(organizationId: string, platform: MeetingPlatform) {
    return this.integrationModel
      .findOneAndUpdate(
        { organizationId, provider: this.providerFor(platform) },
        {
          $set: { status: 'DISCONNECTED' },
          $unset: { accessToken: 1, refreshToken: 1, expiresAt: 1 },
        },
        { new: true },
      )
      .lean()
      .exec();
  }

  private providerFor(platform: MeetingPlatform) {
    return platform === MeetingPlatform.ZOOM
      ? IntegrationProvider.ZOOM
      : IntegrationProvider.GOOGLE_CALENDAR;
  }
}
