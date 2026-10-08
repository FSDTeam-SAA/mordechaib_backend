import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import type { CrmRecordAssociations } from '../../common/types/crm-object-sync.interface';
import { IntegrationProvider } from './integration.schema';

export type CrmRecordDocument = HydratedDocument<CrmRecord>;

@Schema({ timestamps: true, collection: 'crm_records' })
export class CrmRecord {
  @Prop({ required: true, index: true })
  organizationId!: string;

  @Prop({
    required: true,
    enum: [IntegrationProvider.HUBSPOT, IntegrationProvider.SALESFORCE],
    index: true,
  })
  provider!: IntegrationProvider.HUBSPOT | IntegrationProvider.SALESFORCE;

  @Prop({ required: true, trim: true, index: true })
  objectType!: string;

  @Prop({ required: true, trim: true })
  externalId!: string;

  @Prop({ type: Object, required: true, default: {} })
  properties!: Record<string, unknown>;

  @Prop({ type: Object, default: {} })
  associations!: CrmRecordAssociations;

  @Prop()
  providerCreatedAt?: Date;

  @Prop()
  providerUpdatedAt?: Date;

  @Prop({ default: false, index: true })
  archived!: boolean;

  @Prop({ required: true })
  syncedAt!: Date;

  // Retained for provider reconciliation and diagnostics. Normal record reads
  // must explicitly opt in because provider payloads may contain extra fields.
  @Prop({ type: Object, select: false })
  rawPayload?: Record<string, unknown>;
}

export const CrmRecordSchema = SchemaFactory.createForClass(CrmRecord);

CrmRecordSchema.index(
  { organizationId: 1, provider: 1, objectType: 1, externalId: 1 },
  { unique: true },
);
CrmRecordSchema.index({
  organizationId: 1,
  provider: 1,
  objectType: 1,
  archived: 1,
  providerUpdatedAt: -1,
});
