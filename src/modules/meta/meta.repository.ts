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
}
