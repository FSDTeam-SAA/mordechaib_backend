import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { CancellationReason } from '../../common/enums/cancellation-reason.enum';
import { CancellationRequestStatus } from '../../common/enums/cancellation-request-status.enum';
import { RetentionOfferChoice } from '../../common/enums/retention-offer-choice.enum';

export type CancellationRequestDocument = HydratedDocument<CancellationRequest>;

@Schema({ timestamps: true, collection: 'cancellation_requests' })
export class CancellationRequest {
  @Prop({ required: true, index: true })
  organizationId!: string;

  @Prop({ required: true })
  subscriptionId!: string;

  // Snapshotted so execution never needs an extra lookup.
  @Prop({ required: true })
  stripeSubscriptionId!: string;

  @Prop({ required: true, enum: Object.values(CancellationReason) })
  reason!: CancellationReason;

  // Only meaningful when reason is OTHER.
  @Prop({ trim: true })
  reasonDetail?: string;

  @Prop({
    required: true,
    enum: Object.values(RetentionOfferChoice),
    default: RetentionOfferChoice.NONE,
  })
  retentionOfferChoice!: RetentionOfferChoice;

  @Prop({ required: true })
  scheduledCancelAt!: Date;

  @Prop({
    required: true,
    enum: Object.values(CancellationRequestStatus),
    default: CancellationRequestStatus.SCHEDULED,
    index: true,
  })
  status!: CancellationRequestStatus;

  @Prop()
  undoneAt?: Date;

  @Prop()
  executedAt?: Date;

  @Prop({ enum: ['CRON', 'ADMIN'] })
  executedBy?: 'CRON' | 'ADMIN';
}

export const CancellationRequestSchema =
  SchemaFactory.createForClass(CancellationRequest);