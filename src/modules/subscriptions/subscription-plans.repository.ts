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

  findAll(includeInactive: boolean) {
    const filter = includeInactive ? {} : { isActive: true };
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

  create(
    input: CreateSubscriptionPlanDto & {
      stripeProductId?: string;
      stripePriceId?: string;
    },
  ) {
    return this.planModel.create(input);
  }

  updateById(
    id: string,
    input: UpdateSubscriptionPlanDto & {
      stripeProductId?: string;
      stripePriceId?: string;
    },
  ) {
    return this.planModel.findByIdAndUpdate(id, input, { new: true }).exec();
  }

  deleteById(id: string) {
    return this.planModel.findByIdAndDelete(id).exec();
  }
}