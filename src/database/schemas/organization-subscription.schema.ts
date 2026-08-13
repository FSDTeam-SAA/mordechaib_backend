import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { SubscriptionStatus } from '../../common/enums/subscription-status.enum';

export type OrganizationSubscriptionDocument =
  HydratedDocument<OrganizationSubscription>;

@Schema({ timestamps: true, collection: 'organization_subscriptions' })
export class OrganizationSubscription {
  @Prop({ required: true, unique: true, index: true })
  organizationId!: string;

  @Prop({ required: true })
  planId!: string;

  @Prop({
    required: true,
    enum: Object.values(SubscriptionStatus),
    default: SubscriptionStatus.INCOMPLETE,
    index: true,
  })
  status!: SubscriptionStatus;

  @Prop()
  stripeCustomerId?: string;

  @Prop()
  stripeSubscriptionId?: string;

  @Prop()
  currentPeriodStart?: Date;

  @Prop()
  currentPeriodEnd?: Date;

  // 'month' | 'year', taken directly from the Stripe Price's billing
  // interval — not hardcoded, since a plan may offer either later.
  @Prop()
  billingInterval?: string;

  @Prop({ default: false })
  cancelAtPeriodEnd!: boolean;

  // Set while paused (Screen 3 — 30/60/90 days). Stripe's own
  // pause_collection.resumes_at drives the actual billing pause; this is
  // a local mirror for display/filtering and for excluding paused orgs
  // from MRR (see subscription-analytics.repository.ts).
  @Prop()
  pausedUntil?: Date;

  // Snapshot of the plan's limits/pricing at the moment this org subscribed
  // (or last renewed). Read this for enforcement/usage checks AND revenue
  // reporting — not the live SubscriptionPlan document, since that can
  // change under an active subscriber.
  @Prop({
    type: {
      priceUsd: Number,
      aiActionsPerMonth: Number,
      crmContactsLimit: Number,
      callMinutesPerMonth: Number,
      usersIncluded: Number,
      aiAgentsIncluded: Number,
      extraAiActionPriceUsd: Number,
      extraCallMinutePriceUsd: Number,
    },
    _id: false,
  })
  snapshotLimits?: {
    priceUsd?: number;
    aiActionsPerMonth?: number;
    crmContactsLimit?: number;
    callMinutesPerMonth?: number;
    usersIncluded?: number;
    aiAgentsIncluded?: number;
    extraAiActionPriceUsd?: number;
    extraCallMinutePriceUsd?: number;
  };
}

export const OrganizationSubscriptionSchema = SchemaFactory.createForClass(
  OrganizationSubscription,
);