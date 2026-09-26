import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { IntegrationProvider } from './integration.schema';

export type CrmDealDocument = HydratedDocument<CrmDeal>;

export enum CrmDealStageCategory {
  OPEN = 'OPEN',
  WON = 'WON',
  LOST = 'LOST',
}

@Schema({ timestamps: true, collection: 'crm_deals' })
export class CrmDeal {
  @Prop({ required: true, index: true })
  organizationId!: string;

  @Prop({
    required: true,
    enum: [IntegrationProvider.HUBSPOT, IntegrationProvider.SALESFORCE],
    index: true,
  })
  provider!: IntegrationProvider.HUBSPOT | IntegrationProvider.SALESFORCE;

  @Prop({ required: true, trim: true })
  externalId!: string;

  @Prop({ required: true, trim: true })
  name!: string;

  // The provider amount is stored as a number for the MVP. Cross-currency
  // aggregation is deliberately blocked by the analytics service.
  @Prop({ required: true, default: 0 })
  amount!: number;

  @Prop({ required: true, uppercase: true, trim: true, default: 'USD' })
  currency!: string;

  @Prop({ required: true, trim: true })
  providerStage!: string;

  @Prop({ required: true, enum: Object.values(CrmDealStageCategory) })
  stageCategory!: CrmDealStageCategory;

  @Prop()
  closeDate?: Date;

  @Prop()
  ownerId?: string;

  @Prop()
  ownerName?: string;

  @Prop({ default: false, index: true })
  archived!: boolean;

  @Prop()
  providerUpdatedAt?: Date;

  @Prop({ required: true })
  syncedAt!: Date;

  @Prop()
  updatedLocallyAt?: Date;

  // Kept for provider reconciliation only. It is never returned by normal
  // reads and should remain bounded by provider adapters.
  @Prop({ type: Object, select: false })
  rawPayload?: Record<string, unknown>;
}

export const CrmDealSchema = SchemaFactory.createForClass(CrmDeal);
CrmDealSchema.index(
  { organizationId: 1, provider: 1, externalId: 1 },
  { unique: true },
);
CrmDealSchema.index({ organizationId: 1, provider: 1, closeDate: 1 });
CrmDealSchema.index({ organizationId: 1, provider: 1, stageCategory: 1 });
