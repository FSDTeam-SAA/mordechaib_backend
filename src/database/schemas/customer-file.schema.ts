import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { CustomerFileStatus } from '../../common/enums/customer-file-status.enum';
import { MessageAttachmentCategory } from '../../common/enums/message-attachment-category.enum';

export type CustomerFileDocument = HydratedDocument<CustomerFile>;

@Schema({ timestamps: true, collection: 'customer_files' })
export class CustomerFile {
  @Prop({ required: true, index: true })
  organizationId!: string;

  @Prop({ required: true, index: true })
  contactId!: string;

  @Prop({ required: true })
  uploadedByUserId!: string;

  @Prop({ required: true, enum: Object.values(MessageAttachmentCategory) })
  category!: MessageAttachmentCategory;

  @Prop({ required: true, trim: true, maxlength: 255 })
  originalName!: string;

  @Prop({ required: true, trim: true, maxlength: 200 })
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
    enum: Object.values(CustomerFileStatus),
    default: CustomerFileStatus.ACTIVE,
    index: true,
  })
  status!: CustomerFileStatus;

  @Prop()
  deletedAt?: Date;

  @Prop()
  deletedByUserId?: string;

  @Prop({ maxlength: 500 })
  deletionError?: string;
}

export const CustomerFileSchema = SchemaFactory.createForClass(CustomerFile);
CustomerFileSchema.index({
  organizationId: 1,
  contactId: 1,
  status: 1,
  createdAt: -1,
  _id: -1,
});
CustomerFileSchema.index({
  organizationId: 1,
  contactId: 1,
  checksumSha256: 1,
  status: 1,
});
