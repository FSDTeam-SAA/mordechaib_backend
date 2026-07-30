import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  Integration,
  IntegrationProvider,
} from '../../database/schemas/integration.schema';

@Injectable()
export class CalendarRepository {
  constructor(
    @InjectModel(Integration.name)
    private readonly integrationModel: Model<Integration>,
  ) {}

  findConnectedCalendar(organizationId: string) {
    return this.integrationModel
      .findOne({
        organizationId,
        provider: {
          $in: [
            IntegrationProvider.GOOGLE_CALENDAR,
            IntegrationProvider.OUTLOOK_CALENDAR,
          ],
        },
        status: 'CONNECTED',
      })
      .lean()
      .exec();
  }
}
