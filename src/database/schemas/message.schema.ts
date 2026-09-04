import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { MessageProcessingStatus } from '../../common/enums/message-processing-status.enum';
import { MessageSenderType } from '../../common/enums/message-sender-type.enum';
import { MessageType } from '../../common/enums/message-type.enum';

export type MessageDocument = HydratedDocument<Message>;

@Schema({ timestamps: true, collection: 'messages' })
export class Message {
  @Prop({ required: true, index: true })
  organizationId!: string;

  @Prop({ required: true, index: true })
  conversationId!: string;

  @Prop({ required: true, index: true })
  senderId!: string;

  @Prop({ index: true })
  clientMessageId?: string;

  @Prop({
    required: true,
    enum: Object.values(MessageSenderType),
    default: MessageSenderType.USER,
  })
  senderType!: MessageSenderType;

  @Prop({ required: true, enum: Object.values(MessageType) })
  type!: MessageType;

  @Prop({ trim: true, maxlength: 20_000 })
  content?: string;

  @Prop({ required: true, default: 0, min: 0, max: 10 })
  attachmentCount!: number;

  @Prop({
    required: true,
    enum: Object.values(MessageProcessingStatus),
    default: MessageProcessingStatus.NOT_REQUESTED,
    index: true,
  })
  processingStatus!: MessageProcessingStatus;

  @Prop({ index: true })
  sourceMessageId?: string;

  @Prop({ select: false })
  extractedText?: string;

  @Prop({ select: false })
  transcription?: string;

  @Prop({ select: false, maxlength: 500 })
  aiError?: string;

  @Prop()
  processedAt?: Date;

  @Prop({ index: true })
  deletedAt?: Date;

  @Prop()
  deletedBy?: string;
}

export const MessageSchema = SchemaFactory.createForClass(Message);
MessageSchema.index({ organizationId: 1, conversationId: 1, createdAt: -1 });
MessageSchema.index({ organizationId: 1, deletedAt: 1, createdAt: -1 });
MessageSchema.index(
  { organizationId: 1, clientMessageId: 1 },
  {
    unique: true,
    partialFilterExpression: { clientMessageId: { $type: 'string' } },
  },
);
