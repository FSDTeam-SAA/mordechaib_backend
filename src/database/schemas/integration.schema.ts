import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type IntegrationDocument = HydratedDocument<Integration>;

export enum IntegrationProvider {
  TWILIO = 'TWILIO',
  HUBSPOT = 'HUBSPOT',
  SALESFORCE = 'SALESFORCE',
  GOOGLE_CALENDAR = 'GOOGLE_CALENDAR',
  OUTLOOK_CALENDAR = 'OUTLOOK_CALENDAR',
  STRIPE = 'STRIPE',
}

@Schema({ timestamps: true, collection: 'integrations' })
export class Integration {
  @Prop({ required: true, index: true })
  organizationId!: string;

  @Prop({
    required: true,
    enum: Object.values(IntegrationProvider),
    index: true,
  })
  provider!: IntegrationProvider;

  @Prop({
    default: 'CONNECTED',
    enum: ['CONNECTED', 'DISCONNECTED', 'FAILED', 'PENDING'],
  })
  status!: string;

  @Prop()
  accessToken?: string;

  @Prop()
  refreshToken?: string;

  @Prop()
  expiresAt?: Date;

  @Prop({ type: Object, default: {} })
  metadata?: Record<string, unknown>;
}

export const IntegrationSchema = SchemaFactory.createForClass(Integration);
IntegrationSchema.index({ organizationId: 1, provider: 1 }, { unique: true });
