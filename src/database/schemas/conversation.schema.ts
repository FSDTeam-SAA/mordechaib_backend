import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { ConversationStatus } from '../../common/enums/conversation-status.enum';

export type ConversationDocument = HydratedDocument<Conversation>;

@Schema({ timestamps: true, collection: 'conversations' })
export class Conversation {
  @Prop({ required: true, unique: true, index: true })
  organizationId!: string;

  @Prop({ required: true, index: true })
  createdBy!: string;

  @Prop({ required: true, trim: true, default: 'AI Assistant' })
  title!: string;

  @Prop({
    required: true,
    enum: Object.values(ConversationStatus),
    default: ConversationStatus.ACTIVE,
    index: true,
  })
  status!: ConversationStatus;

  @Prop({ required: true, default: 0, min: 0 })
  totalMessageCount!: number;

  @Prop()
  lastMessageAt?: Date;
}

export const ConversationSchema = SchemaFactory.createForClass(Conversation);
ConversationSchema.index({ organizationId: 1, status: 1 });
