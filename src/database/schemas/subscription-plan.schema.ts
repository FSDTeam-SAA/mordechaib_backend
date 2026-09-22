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

  @Prop()
  priceUsd?: number;

  // A plan card can be offered for one or both recurring billing cycles.
  // priceUsd remains the monthly amount for backwards compatibility;
  // annualPriceUsd is the amount charged once per year.
  @Prop({ type: [String], enum: ['month', 'year'], default: ['month'] })
  billingCycles!: ('month' | 'year')[];

  @Prop()
  annualPriceUsd?: number;

  @Prop({ default: false })
  isInquiryOnly!: boolean;

  @Prop()
  aiActionsPerMonth?: number;

  @Prop()
  crmContactsLimit?: number;

  @Prop()
  callMinutesPerMonth?: number;

  @Prop()
  meetingHoursPerMonth?: number;

  @Prop()
  usersIncluded?: number;

  @Prop({ default: 6 })
  aiAgentsIncluded?: number;

  @Prop({ default: 0 })
  trialDays?: number;

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

  // Backend-managed — set automatically by SubscriptionPlansService when
  // the plan is created/priced via Stripe. Never accepted as admin input
  // (see CreateSubscriptionPlanDto — there is no stripePriceId field on it).
  @Prop()
  stripeProductId?: string;

  @Prop()
  stripePriceId?: string;

  @Prop()
  stripeAnnualPriceId?: string;
}

export const SubscriptionPlanSchema =
  SchemaFactory.createForClass(SubscriptionPlan);
