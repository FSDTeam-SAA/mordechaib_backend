import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import {
  EmailDraftStatus,
  EmailProvider,
} from '../../common/enums/email-provider.enum';

export type EmailDraftDocument = HydratedDocument<EmailDraft>;

@Schema({ timestamps: true, collection: 'email_drafts' })
export class EmailDraft {
  @Prop({ required: true, index: true })
  organizationId!: string;

  @Prop({ required: true, index: true })
  userId!: string;

  @Prop({ enum: Object.values(EmailProvider) })
  provider?: EmailProvider;

  @Prop({ type: [String], required: true })
  to!: string[];

  @Prop({ required: true, trim: true, maxlength: 300 })
  subject!: string;

  @Prop({ required: true, maxlength: 20_000 })
  body!: string;

  @Prop({ required: true, enum: Object.values(EmailDraftStatus), index: true })
  status!: EmailDraftStatus;

  @Prop({ required: true, default: 1, min: 1 })
  revision!: number;

  @Prop()
  sourceMessageId?: string;

  @Prop()
  sourceConversationId?: string;

  @Prop()
  sourceAiResponseId?: string;

  @Prop()
  clientDraftId?: string;

  @Prop()
  sendAttemptId?: string;

  @Prop({ default: 0 })
  sendAttemptCount!: number;

  @Prop()
  providerMessageId?: string;

  @Prop()
  sentFrom?: string;

  @Prop()
  sentAt?: Date;

  @Prop()
  lastError?: string;
}

export const EmailDraftSchema = SchemaFactory.createForClass(EmailDraft);
EmailDraftSchema.index({ organizationId: 1, userId: 1, createdAt: -1 });
EmailDraftSchema.index(
  { organizationId: 1, sourceAiResponseId: 1 },
  {
    unique: true,
    partialFilterExpression: { sourceAiResponseId: { $type: 'string' } },
  },
);
EmailDraftSchema.index(
  { organizationId: 1, userId: 1, clientDraftId: 1 },
  {
    unique: true,
    partialFilterExpression: { clientDraftId: { $type: 'string' } },
  },
);
