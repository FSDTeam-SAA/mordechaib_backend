import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { ConversationStatus } from '../../common/enums/conversation-status.enum';

export type ConversationDocument = HydratedDocument<Conversation>;

@Schema({ timestamps: true, collection: 'conversations' })
export class Conversation {
  @Prop({ required: true, index: true })
  organizationId!: string;

  @Prop({ required: true, index: true })
  createdBy!: string;

  @Prop({ required: true, trim: true, default: 'AI Assistant' })
  title!: string;

  @Prop({ default: false })
  isDefault!: boolean;

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
ConversationSchema.index({
  organizationId: 1,
  createdBy: 1,
  lastMessageAt: -1,
});
ConversationSchema.index(
  { organizationId: 1, createdBy: 1, isDefault: 1 },
  {
    unique: true,
    partialFilterExpression: { isDefault: true },
  },
);
