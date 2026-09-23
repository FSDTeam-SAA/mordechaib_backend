import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import {
  SupportAttachmentStatus,
  SupportRequestCategory,
  SupportRequestStatus,
} from '../../common/enums/support-request.enum';

@Schema({ _id: true, timestamps: true })
export class SupportRequestAttachment {
  _id!: Types.ObjectId;

  @Prop({ required: true, trim: true, maxlength: 255 })
  originalName!: string;

  @Prop({
    required: true,
    enum: ['application/pdf', 'image/jpeg', 'image/png'],
  })
  mimeType!: string;

  @Prop({ required: true, min: 1 })
  sizeBytes!: number;

  @Prop({ required: true, trim: true, lowercase: true })
  checksumSha256!: string;

  @Prop({ required: true, default: 'CLOUDINARY' })
  storageProvider!: string;

  @Prop({ required: true, select: false })
  storageKey!: string;

  @Prop({ select: false })
  storageAssetId?: string;

  @Prop({ required: true, select: false })
  storageResourceType!: string;

  @Prop({ required: true, select: false })
  storageDeliveryType!: string;

  @Prop({ required: true, select: false })
  storageFormat!: string;

  @Prop({
    required: true,
    enum: Object.values(SupportAttachmentStatus),
    default: SupportAttachmentStatus.ACTIVE,
  })
  status!: SupportAttachmentStatus;

  @Prop()
  deletedAt?: Date;

  @Prop({ maxlength: 500 })
  deletionError?: string;
}

const SupportRequestAttachmentSchema = SchemaFactory.createForClass(
  SupportRequestAttachment,
);

export type SupportRequestDocument = HydratedDocument<SupportRequest>;

@Schema({ timestamps: true, collection: 'support_requests' })
export class SupportRequest {
  @Prop({ required: true, unique: true, index: true, trim: true })
  ticketId!: string;

  @Prop({ required: true, index: true })
  organizationId!: string;

  @Prop({ required: true, index: true })
  createdByUserId!: string;

  @Prop({ required: true, enum: Object.values(SupportRequestCategory) })
  category!: SupportRequestCategory;

  @Prop({ required: true, trim: true, minlength: 3, maxlength: 200 })
  subject!: string;

  @Prop({ required: true, trim: true, minlength: 10, maxlength: 20_000 })
  description!: string;

  @Prop({
    required: true,
    enum: Object.values(SupportRequestStatus),
    default: SupportRequestStatus.OPEN,
    index: true,
  })
  status!: SupportRequestStatus;

  @Prop({ type: [SupportRequestAttachmentSchema], default: [] })
  attachments!: SupportRequestAttachment[];

  @Prop({ required: true, default: 0, min: 0, max: 5 })
  attachmentCount!: number;

  @Prop({ maxlength: 2_000 })
  resolutionNote?: string;

  @Prop()
  statusChangedAt?: Date;

  @Prop()
  statusChangedByUserId?: string;

  @Prop({ index: true })
  deletedAt?: Date;

  @Prop()
  deletedByUserId?: string;
}

export const SupportRequestSchema =
  SchemaFactory.createForClass(SupportRequest);
SupportRequestSchema.index({
  organizationId: 1,
  createdByUserId: 1,
  deletedAt: 1,
  updatedAt: -1,
});
SupportRequestSchema.index({ status: 1, deletedAt: 1, updatedAt: -1 });
