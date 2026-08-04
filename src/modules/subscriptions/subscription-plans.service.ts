import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CreateSubscriptionPlanDto } from './dto/create-subscription-plan.dto';
import { UpdateSubscriptionPlanDto } from './dto/update-subscription-plan.dto';
import { SubscriptionPlansRepository } from './subscription-plans.repository';
import { SubscriptionsRepository } from './subscriptions.repository';

@Injectable()
export class SubscriptionPlansService {
  constructor(
    private readonly repository: SubscriptionPlansRepository,
    private readonly subscriptionsRepository: SubscriptionsRepository,
  ) {}

  findAll(includeInactive = false) {
    return this.repository.findAll(includeInactive);
  }

  async findById(id: string) {
    const plan = await this.repository.findById(id);
    if (!plan) throw new NotFoundException('Subscription plan not found');
    return plan;
  }

  async findByPlanType(planType: string) {
    const plan = await this.repository.findByPlanType(planType);
    if (!plan) throw new NotFoundException('Subscription plan not found');
    return plan;
  }

  async create(dto: CreateSubscriptionPlanDto) {
    const existing = await this.repository.findByPlanType(dto.planType);
    if (existing) {
      throw new ConflictException(`A plan for ${dto.planType} already exists`);
    }
    return this.repository.create(dto);
  }

  async update(id: string, dto: UpdateSubscriptionPlanDto) {
    const updated = await this.repository.updateById(id, dto);
    if (!updated) throw new NotFoundException('Subscription plan not found');
    return updated;
  }

  async delete(id: string) {
    const plan = await this.findById(id);
    const inUse = await this.subscriptionsRepository.existsForPlan(
      String(plan._id),
    );
    if (inUse) {
      throw new ConflictException(
        'This plan has active subscribers — deactivate it instead of deleting',
      );
    }
    await this.repository.deleteById(id);
    return { message: 'Subscription plan deleted' };
  }
}
