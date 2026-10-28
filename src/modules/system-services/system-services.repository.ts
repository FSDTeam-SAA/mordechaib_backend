import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  PlatformServiceControl,
  PlatformServiceKey,
} from '../../database/schemas/platform-service-control.schema';

@Injectable()
export class SystemServicesRepository {
  constructor(
    @InjectModel(PlatformServiceControl.name)
    private readonly controls: Model<PlatformServiceControl>,
  ) {}

  find(service: PlatformServiceKey) {
    return this.controls.findOne({ service }).lean().exec();
  }

  update(
    service: PlatformServiceKey,
    input: {
      enabled: boolean;
      reason?: string;
      changedByUserId: string;
      changedAt: Date;
    },
  ) {
    return this.controls
      .findOneAndUpdate(
        { service },
        {
          $set: {
            service,
            enabled: input.enabled,
            changedByUserId: input.changedByUserId,
            changedAt: input.changedAt,
            ...(input.reason ? { reason: input.reason } : {}),
          },
          ...(!input.reason ? { $unset: { reason: 1 } } : {}),
        },
        { new: true, upsert: true, setDefaultsOnInsert: true },
      )
      .lean()
      .exec();
  }
}
