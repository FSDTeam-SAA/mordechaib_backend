import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { MessageAttachmentCategory } from '../../common/enums/message-attachment-category.enum';
import { MessageAttachmentStatus } from '../../common/enums/message-attachment-status.enum';
import { MessageProcessingStatus } from '../../common/enums/message-processing-status.enum';

export type MessageAttachmentDocument = HydratedDocument<MessageAttachment>;

@Schema({ timestamps: true, collection: 'message_attachments' })
export class MessageAttachment {
  @Prop({ required: true, index: true })
  organizationId!: string;

  @Prop({ required: true, index: true })
  messageId!: string;

  @Prop({ required: true, enum: Object.values(MessageAttachmentCategory) })
  category!: MessageAttachmentCategory;

  @Prop({ required: true, trim: true, maxlength: 255 })
  originalName!: string;

  @Prop({ required: true, trim: true })
  mimeType!: string;

  @Prop({ required: true, min: 1 })
  sizeBytes!: number;

  @Prop({ required: true, trim: true, lowercase: true })
  checksumSha256!: string;

  @Prop({ required: true, trim: true })
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
    enum: Object.values(MessageAttachmentStatus),
    default: MessageAttachmentStatus.ACTIVE,
    index: true,
  })
  status!: MessageAttachmentStatus;

  @Prop({
    required: true,
    enum: Object.values(MessageProcessingStatus),
    default: MessageProcessingStatus.NOT_REQUESTED,
    index: true,
  })
  processingStatus!: MessageProcessingStatus;

  @Prop({ select: false })
  extractedText?: string;

  @Prop({ select: false })
  transcription?: string;

  @Prop()
  deletedAt?: Date;

  @Prop({ maxlength: 500 })
  deletionError?: string;
}

export const MessageAttachmentSchema =
  SchemaFactory.createForClass(MessageAttachment);
MessageAttachmentSchema.index({ organizationId: 1, messageId: 1 });
MessageAttachmentSchema.index({ messageId: 1, status: 1 });
