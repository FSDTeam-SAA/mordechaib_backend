import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { SubscriptionPlan } from '../../database/schemas/subscription-plan.schema';
import { CreateSubscriptionPlanDto } from './dto/create-subscription-plan.dto';
import { UpdateSubscriptionPlanDto } from './dto/update-subscription-plan.dto';

@Injectable()
export class SubscriptionPlansRepository {
  constructor(
    @InjectModel(SubscriptionPlan.name)
    private readonly planModel: Model<SubscriptionPlan>,
  ) {}

  findAll(includeInactive: boolean, billingCycle?: 'month' | 'year') {
    const filter: Record<string, unknown> = includeInactive
      ? {}
      : { isActive: true };
    if (billingCycle === 'month') {
      // Plans created before billingCycles was introduced are monthly.
      filter.$or = [
        { billingCycles: 'month' },
        { billingCycles: { $exists: false } },
      ];
    } else if (billingCycle === 'year') {
      filter.billingCycles = 'year';
    }
    return this.planModel.find(filter).sort({ sortOrder: 1 }).exec();
  }

  findById(id: string) {
    return this.planModel.findById(id).exec();
  }

  findByPlanType(planType: string) {
    return this.planModel.findOne({ planType }).exec();
  }

  findByIds(ids: string[]) {
    return this.planModel.find({ _id: { $in: ids } }).exec();
  }

  backfillLegacyBillingCycles() {
    return this.planModel
      .updateMany(
        {
          $or: [
            { billingCycles: { $exists: false } },
            { billingCycles: { $size: 0 } },
          ],
        },
        { $set: { billingCycles: ['month'] } },
      )
      .exec();
  }

  create(
    input: CreateSubscriptionPlanDto & {
      stripeProductId?: string;
      stripePriceId?: string;
      stripeAnnualPriceId?: string;
    },
  ) {
    return this.planModel.create(input);
  }

  updateById(
    id: string,
    input: UpdateSubscriptionPlanDto & {
      stripeProductId?: string;
      stripePriceId?: string;
      stripeAnnualPriceId?: string;
    },
  ) {
    return this.planModel.findByIdAndUpdate(id, input, { new: true }).exec();
  }

  deleteById(id: string) {
    return this.planModel.findByIdAndDelete(id).exec();
  }
}
