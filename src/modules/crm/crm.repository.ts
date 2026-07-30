import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  Integration,
  IntegrationProvider,
} from '../../database/schemas/integration.schema';

@Injectable()
export class CrmRepository {
  constructor(
    @InjectModel(Integration.name)
    private readonly integrationModel: Model<Integration>,
  ) {}

  findConnectedCrm(organizationId: string) {
    return this.integrationModel
      .findOne({
        organizationId,
        provider: {
          $in: [IntegrationProvider.HUBSPOT, IntegrationProvider.SALESFORCE],
        },
        status: 'CONNECTED',
      })
      .lean()
      .exec();
  }
}
