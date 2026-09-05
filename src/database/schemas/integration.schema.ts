import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type IntegrationDocument = HydratedDocument<Integration>;

export enum IntegrationProvider {
  ZOOM = 'ZOOM',
  TWILIO = 'TWILIO',
  HUBSPOT = 'HUBSPOT',
  SALESFORCE = 'SALESFORCE',
  GOOGLE_CALENDAR = 'GOOGLE_CALENDAR',
  OUTLOOK_CALENDAR = 'OUTLOOK_CALENDAR',
  GMAIL = 'GMAIL',
  STRIPE = 'STRIPE',
  META = 'META',
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

  @Prop({ select: false })
  accessToken?: string;

  @Prop({ select: false })
  refreshToken?: string;

  @Prop()
  expiresAt?: Date;

  @Prop({ default: false, index: true })
  isDefaultCalendar?: boolean;

  @Prop({ type: Object, default: {} })
  metadata?: Record<string, unknown>;
}

export const IntegrationSchema = SchemaFactory.createForClass(Integration);
IntegrationSchema.index({ organizationId: 1, provider: 1 }, { unique: true });
IntegrationSchema.index(
  { organizationId: 1, isDefaultCalendar: 1 },
  {
    unique: true,
    partialFilterExpression: { isDefaultCalendar: true },
  },
);
