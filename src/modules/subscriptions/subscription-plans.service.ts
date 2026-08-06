import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { StripeProvider } from '../stripe/stripe.provider';
import { CreateSubscriptionPlanDto } from './dto/create-subscription-plan.dto';
import { UpdateSubscriptionPlanDto } from './dto/update-subscription-plan.dto';
import { SubscriptionPlansRepository } from './subscription-plans.repository';
import { SubscriptionsRepository } from './subscriptions.repository';

@Injectable()
export class SubscriptionPlansService {
  constructor(
    private readonly repository: SubscriptionPlansRepository,
    private readonly subscriptionsRepository: SubscriptionsRepository,
    private readonly stripeProvider: StripeProvider,
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

  findByIds(ids: string[]) {
    return this.repository.findByIds(ids);
  }

  // Creates the matching Stripe Product + Price automatically — admins
  // never provide a stripePriceId themselves (it isn't even a field on
  // CreateSubscriptionPlanDto).
  async create(dto: CreateSubscriptionPlanDto) {
    const existing = await this.repository.findByPlanType(dto.planType);
    if (existing) {
      throw new ConflictException(`A plan for ${dto.planType} already exists`);
    }

    if (!dto.isInquiryOnly && dto.priceUsd == null) {
      throw new BadRequestException(
        'priceUsd is required for a purchasable plan (omit it only when isInquiryOnly is true)',
      );
    }

    let stripeProductId: string | undefined;
    let stripePriceId: string | undefined;

    if (!dto.isInquiryOnly) {
      const product = await this.stripeProvider.createProduct({
        name: dto.name,
        description: dto.tagline,
      });
      const price = await this.stripeProvider.createPrice({
        productId: product.id,
        unitAmountUsd: dto.priceUsd!,
        interval: 'month',
      });
      stripeProductId = product.id;
      stripePriceId = price.id;
    }

    return this.repository.create({ ...dto, stripeProductId, stripePriceId });
  }

  // Handles three cases automatically:
  // 1. Plan never had a Stripe Product/Price yet (e.g. it was created
  //    before this was automated, or is transitioning from inquiry-only
  //    to purchasable) — creates them now.
  // 2. priceUsd is actually changing — Stripe Prices are immutable, so
  //    this creates a new Price under the same Product and archives the
  //    old one. Existing subscribers keep billing at their original price
  //    — only new checkouts pick up the new price.
  // 3. Neither of the above — just a normal field update, no Stripe calls.
  async update(id: string, dto: UpdateSubscriptionPlanDto) {
    const existing = await this.findById(id);
    const patch: UpdateSubscriptionPlanDto & {
      stripeProductId?: string;
      stripePriceId?: string;
    } = { ...dto };

    const willBeInquiryOnly = dto.isInquiryOnly ?? existing.isInquiryOnly;

    if (!willBeInquiryOnly) {
      const nextPriceUsd = dto.priceUsd ?? existing.priceUsd;
      if (nextPriceUsd == null) {
        throw new BadRequestException(
          'priceUsd is required for a purchasable plan',
        );
      }

      if (!existing.stripeProductId) {
        const product = await this.stripeProvider.createProduct({
          name: dto.name ?? existing.name,
          description: dto.tagline ?? existing.tagline,
        });
        patch.stripeProductId = product.id;
        const price = await this.stripeProvider.createPrice({
          productId: product.id,
          unitAmountUsd: nextPriceUsd,
          interval: 'month',
        });
        patch.stripePriceId = price.id;
      } else if (dto.priceUsd !== undefined && dto.priceUsd !== existing.priceUsd) {
        const price = await this.stripeProvider.createPrice({
          productId: existing.stripeProductId,
          unitAmountUsd: dto.priceUsd,
          interval: 'month',
        });
        if (existing.stripePriceId) {
          await this.stripeProvider
            .archivePrice(existing.stripePriceId)
            .catch(() => undefined); // best-effort — don't fail the update over this
        }
        patch.stripePriceId = price.id;
      }

      if (existing.stripeProductId && dto.name && dto.name !== existing.name) {
        await this.stripeProvider
          .updateProductName(existing.stripeProductId, dto.name)
          .catch(() => undefined);
      }
    }

    const updated = await this.repository.updateById(id, patch);
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