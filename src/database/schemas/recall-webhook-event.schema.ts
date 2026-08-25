import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type RecallWebhookEventDocument = HydratedDocument<RecallWebhookEvent>;

@Schema({ timestamps: true, collection: 'recall_webhook_events' })
export class RecallWebhookEvent {
  @Prop({ required: true, unique: true, index: true })
  eventId!: string;

  @Prop({ required: true, index: true })
  eventType!: string;

  @Prop({
    required: true,
    enum: ['PROCESSING', 'PROCESSED', 'FAILED'],
    default: 'PROCESSING',
    index: true,
  })
  status!: string;

  @Prop()
  processedAt?: Date;

  @Prop()
  error?: string;
}

export const RecallWebhookEventSchema =
  SchemaFactory.createForClass(RecallWebhookEvent);
RecallWebhookEventSchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: 2592000 },
);
