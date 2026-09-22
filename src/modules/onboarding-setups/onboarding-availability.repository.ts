import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { OnboardingAvailability } from '../../database/schemas/onboarding-availability.schema';

const DEFAULT_AVAILABILITY_KEY = 'DEFAULT';

@Injectable()
export class OnboardingAvailabilityRepository {
  constructor(
    @InjectModel(OnboardingAvailability.name)
    private readonly availabilityModel: Model<OnboardingAvailability>,
  ) {}

  findDefault() {
    return this.availabilityModel
      .findOne({ key: DEFAULT_AVAILABILITY_KEY })
      .lean()
      .exec();
  }

  upsertDefault(input: Record<string, unknown>, clearEndDate: boolean) {
    return this.availabilityModel
      .findOneAndUpdate(
        { key: DEFAULT_AVAILABILITY_KEY },
        {
          $set: input,
          $setOnInsert: { key: DEFAULT_AVAILABILITY_KEY },
          ...(clearEndDate ? { $unset: { endDate: 1 } } : {}),
        },
        { new: true, upsert: true, runValidators: true },
      )
      .lean()
      .exec();
  }
}
