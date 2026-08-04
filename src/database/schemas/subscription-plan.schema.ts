import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { PlanType } from '../../common/enums/plan-type.enum';

export type SubscriptionPlanDocument = HydratedDocument<SubscriptionPlan>;

@Schema({ timestamps: true, collection: 'subscription_plans' })
export class SubscriptionPlan {
  @Prop({ required: true, unique: true, enum: Object.values(PlanType) })
  planType!: PlanType;

  @Prop({ required: true, trim: true })
  name!: string;

  @Prop({ trim: true })
  tagline?: string;

  // Omitted entirely for CUSTOM (variable/quote-based pricing). Stored as a
  // plain dollar amount, e.g. 49 = $49.00.
  @Prop()
  priceUsd?: number;

  @Prop({ default: false })
  isInquiryOnly!: boolean;

  @Prop()
  aiActionsPerMonth?: number;

  // Omitted = unlimited (e.g. Enterprise's "Unlimited contacts").
  @Prop()
  crmContactsLimit?: number;

  @Prop()
  callMinutesPerMonth?: number;

  @Prop()
  usersIncluded?: number;

  @Prop({ default: 6 })
  aiAgentsIncluded?: number;

  // Days of free trial before the first Stripe charge. Omit/0 = no trial.
  // Irrelevant for CUSTOM (isInquiryOnly plans never reach checkout).
  @Prop({ default: 0 })
  trialDays?: number;

  // Per-unit overage pricing, stored as a dollar amount and allowed to
  // carry a fractional component (e.g. 0.025 = $0.025/min).
  @Prop()
  extraAiActionPriceUsd?: number;

  @Prop()
  extraCallMinutePriceUsd?: number;

  @Prop({ type: [String], default: [] })
  features!: string[];

  @Prop({ default: false })
  isMostPopular!: boolean;

  @Prop({ default: false })
  customizationIncluded!: boolean;

  @Prop({ default: true, index: true })
  isActive!: boolean;

  @Prop({ default: 0 })
  sortOrder!: number;

  // Links this catalog row to a Stripe Price for checkout session creation.
  @Prop()
  stripePriceId?: string;
}

export const SubscriptionPlanSchema =
  SchemaFactory.createForClass(SubscriptionPlan);
