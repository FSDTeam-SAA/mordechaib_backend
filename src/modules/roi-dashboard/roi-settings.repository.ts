import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { RoiConfiguration } from '../../database/schemas/roi-configuration.schema';

@Injectable()
export class RoiSettingsRepository {
  constructor(
    @InjectModel(RoiConfiguration.name)
    private readonly configurations: Model<RoiConfiguration>,
  ) {}

  find(organizationId: string) {
    return this.configurations.findOne({ organizationId }).lean().exec();
  }

  upsert(
    organizationId: string,
    updatedBy: string,
    values: Partial<RoiConfiguration>,
  ) {
    return this.configurations
      .findOneAndUpdate(
        { organizationId },
        { $set: { ...values, organizationId, updatedBy } },
        {
          new: true,
          upsert: true,
          runValidators: true,
          setDefaultsOnInsert: true,
        },
      )
      .lean()
      .exec();
  }
}
