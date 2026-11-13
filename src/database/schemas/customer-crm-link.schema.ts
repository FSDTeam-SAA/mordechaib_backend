import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { IntegrationProvider } from './integration.schema';

export type CustomerCrmLinkDocument = HydratedDocument<CustomerCrmLink>;

@Schema({ timestamps: true, collection: 'customer_crm_links' })
export class CustomerCrmLink {
  @Prop({ required: true, index: true })
  organizationId!: string;

  @Prop({ required: true, index: true })
  contactId!: string;

  @Prop({ required: true, index: true })
  crmRecordId!: string;

  @Prop({
    required: true,
    enum: [IntegrationProvider.HUBSPOT, IntegrationProvider.SALESFORCE],
  })
  provider!: IntegrationProvider.HUBSPOT | IntegrationProvider.SALESFORCE;

  @Prop({ required: true, trim: true, maxlength: 160 })
  objectType!: string;

  @Prop({ required: true, trim: true, maxlength: 255 })
  externalId!: string;

  @Prop({ required: true })
  linkedByUserId!: string;
}

export const CustomerCrmLinkSchema =
  SchemaFactory.createForClass(CustomerCrmLink);

CustomerCrmLinkSchema.index(
  { organizationId: 1, crmRecordId: 1 },
  { unique: true },
);
CustomerCrmLinkSchema.index({
  organizationId: 1,
  contactId: 1,
  createdAt: -1,
});
CustomerCrmLinkSchema.index(
  { organizationId: 1, provider: 1, objectType: 1, externalId: 1 },
  { unique: true },
);
