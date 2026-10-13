import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  Integration,
  IntegrationProvider,
} from '../../database/schemas/integration.schema';

@Injectable()
export class MetaRepository {
  constructor(
    @InjectModel(Integration.name)
    private readonly integrationModel: Model<Integration>,
  ) {}

  findByOrganization(organizationId: string) {
    return this.integrationModel
      .findOne({ organizationId, provider: IntegrationProvider.META })
      .lean()
      .exec();
  }

  findByOrganizationWithAccessToken(organizationId: string) {
    return this.integrationModel
      .findOne({ organizationId, provider: IntegrationProvider.META })
      .select('+accessToken')
      .lean()
      .exec();
  }

  upsert(organizationId: string, input: Partial<Integration>) {
    return this.integrationModel
      .findOneAndUpdate(
        { organizationId, provider: IntegrationProvider.META },
        { $set: input },
        { new: true, upsert: true, runValidators: true },
      )
      .lean()
      .exec();
  }

  disconnect(organizationId: string) {
    return this.integrationModel
      .findOneAndUpdate(
        { organizationId, provider: IntegrationProvider.META },
        {
          $set: { status: 'DISCONNECTED' },
          $unset: {
            accessToken: 1,
            refreshToken: 1,
            expiresAt: 1,
            metadata: 1,
          },
        },
        { new: true, runValidators: true },
      )
      .lean()
      .exec();
  }
}
