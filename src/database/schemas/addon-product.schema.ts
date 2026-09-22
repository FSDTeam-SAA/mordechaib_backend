import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { AddonCategory } from '../../common/enums/addon-category.enum';

export type AddonProductDocument = HydratedDocument<AddonProduct>;

// A single purchasable tier within an add-on pack (e.g. "1,000 AI Actions — $25")
export class AddonTier {
  // Human-readable label shown in the UI (e.g. "1,000 AI Actions")
  label!: string;

  // Machine-readable quantity (e.g. 1000 actions, 500 voice minutes, 10 hours).
  // Exact meaning depends on the category.
  quantity!: number;

  priceUsd!: number;

  // Automatically set by AddonProductsService when the tier is created/updated
  stripeProductId?: string;
  stripePriceId?: string;
}

@Schema({ timestamps: true, collection: 'addon_products' })
export class AddonProduct {
  // One document per category — the tiers array holds the selectable options.
  @Prop({
    required: true,
    unique: true,
    enum: Object.values(AddonCategory),
    index: true,
  })
  category!: AddonCategory;

  @Prop({ required: true, trim: true })
  name!: string;

  @Prop({ trim: true })
  description?: string;

  // If true, the user sees the add-on but must "Contact Sales" — no Stripe
  // checkout. Operations Booster can be set to this.
  @Prop({ default: false })
  isInquiryOnly!: boolean;

  @Prop({ default: true, index: true })
  isActive!: boolean;

  @Prop({ default: 0 })
  sortOrder!: number;

  @Prop({
    type: [
      {
        label: { type: String, required: true },
        quantity: { type: Number, required: true },
        priceUsd: { type: Number, required: true },
        stripeProductId: { type: String },
        stripePriceId: { type: String },
        _id: false,
      },
    ],
    default: [],
  })
  tiers!: AddonTier[];
}

export const AddonProductSchema = SchemaFactory.createForClass(AddonProduct);
