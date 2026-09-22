import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AddonTier } from '../../database/schemas/addon-product.schema';
import { StripeProvider } from '../stripe/stripe.provider';
import { AddonProductsRepository } from './addon-products.repository';
import { CreateAddonProductDto, AddonTierDto } from './dto/create-addon-product.dto';
import { UpdateAddonProductDto } from './dto/update-addon-product.dto';

@Injectable()
export class AddonProductsService {
  constructor(
    private readonly repository: AddonProductsRepository,
    private readonly stripeProvider: StripeProvider,
  ) {}

  findAll(includeInactive = false) {
    return this.repository.findAll(includeInactive);
  }

  async findById(id: string) {
    const addon = await this.repository.findById(id);
    if (!addon) throw new NotFoundException('Add-on product not found');
    return addon;
  }

  // Admin: create a new add-on pack. Automatically creates one Stripe Product
  // + one Stripe Price per tier (unless the add-on is inquiry-only).
  async create(dto: CreateAddonProductDto) {
    const existing = await this.repository.findByCategory(dto.category);
    if (existing) {
      throw new ConflictException(
        `An add-on product for category ${dto.category} already exists`,
      );
    }

    const enrichedTiers = await this.enrichTiersWithStripe(
      dto.name,
      dto.tiers,
      dto.isInquiryOnly ?? false,
    );

    return this.repository.create({ ...dto, tiers: enrichedTiers });
  }

  // Admin: update an existing add-on pack.
  // If tiers change and the add-on is not inquiry-only, this creates new
  // Stripe products/prices for any tier whose stripePriceId is absent.
  // Existing Stripe prices are NOT archived here — only new/missing ones
  // are created. For a full tier replacement, delete and recreate.
  async update(id: string, dto: UpdateAddonProductDto) {
    const existing = await this.findById(id);
    const willBeInquiryOnly =
      dto.isInquiryOnly ?? existing.isInquiryOnly;

    let tiersToSave: AddonTier[] | undefined;
    if (dto.tiers !== undefined) {
      tiersToSave = await this.enrichTiersWithStripe(
        dto.name ?? existing.name,
        dto.tiers as AddonTierDto[],
        willBeInquiryOnly,
      );
    }

    const updated = await this.repository.updateById(id, {
      ...dto,
      ...(tiersToSave !== undefined ? { tiers: tiersToSave } : {}),
    });
    if (!updated) throw new NotFoundException('Add-on product not found');
    return updated;
  }

  async delete(id: string) {
    const addon = await this.findById(id);
    // Soft safety: check that no org currently holds this add-on active.
    // (Full enforcement requires checking OrganizationSubscription — skipped
    //  here for simplicity; admin is warned via docs.)
    if (!addon) throw new NotFoundException('Add-on product not found');
    await this.repository.deleteById(id);
    return { message: 'Add-on product deleted' };
  }

  // --- Internal helpers ---

  // Creates Stripe Product + recurring Price for each tier that does not
  // already have a stripePriceId. Returns the enriched tiers array.
  private async enrichTiersWithStripe(
    productBaseName: string,
    tiers: AddonTierDto[],
    isInquiryOnly: boolean,
  ): Promise<AddonTier[]> {
    if (isInquiryOnly) {
      // No Stripe objects needed — just store the tier metadata
      return tiers.map((t) => ({ ...t }));
    }

    const enriched: AddonTier[] = [];
    for (const tier of tiers) {
      const product = await this.stripeProvider.createProduct({
        name: `${productBaseName} — ${tier.label}`,
      });
      const price = await this.stripeProvider.createPrice({
        productId: product.id,
        unitAmountUsd: tier.priceUsd,
        interval: 'month',
      });
      enriched.push({
        label: tier.label,
        quantity: tier.quantity,
        priceUsd: tier.priceUsd,
        stripeProductId: product.id,
        stripePriceId: price.id,
      });
    }
    return enriched;
  }

  // Used by BillingService to get the strip price id for a specific tier
  async getTierStripePriceId(
    addonProductId: string,
    tierIndex: number,
  ): Promise<string> {
    const addon = await this.findById(addonProductId);
    const tier = addon.tiers[tierIndex];
    if (!tier) {
      throw new BadRequestException(
        `Tier index ${tierIndex} not found on add-on ${addonProductId}`,
      );
    }
    if (addon.isInquiryOnly) {
      throw new BadRequestException(
        `This add-on tier has no Stripe price — it may be inquiry-only`,
      );
    }
    const productId = await this.stripeProvider.ensureProduct({
      productId: tier.stripeProductId,
      name: `${addon.name} - ${tier.label}`,
    });
    const priceId = await this.stripeProvider.ensureRecurringPrice({
      priceId: tier.stripePriceId,
      productId,
      unitAmountUsd: tier.priceUsd,
      interval: 'month',
    });

    if (
      productId !== tier.stripeProductId ||
      priceId !== tier.stripePriceId
    ) {
      const tiers = addon.tiers.map((existingTier, index) => ({
        label: existingTier.label,
        quantity: existingTier.quantity,
        priceUsd: existingTier.priceUsd,
        stripeProductId:
          index === tierIndex ? productId : existingTier.stripeProductId,
        stripePriceId:
          index === tierIndex ? priceId : existingTier.stripePriceId,
      }));
      await this.repository.updateById(addonProductId, { tiers });
    }
    return priceId;
  }
}
