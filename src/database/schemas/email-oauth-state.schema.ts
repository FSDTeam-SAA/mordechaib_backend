import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { EmailProvider } from '../../common/enums/email-provider.enum';

export type EmailOAuthStateDocument = HydratedDocument<EmailOAuthState>;

@Schema({ timestamps: true, collection: 'email_oauth_states' })
export class EmailOAuthState {
  @Prop({ required: true, unique: true, select: false })
  nonceHash!: string;

  @Prop({ required: true, enum: Object.values(EmailProvider) })
  provider!: EmailProvider;

  @Prop({ required: true })
  organizationId!: string;

  @Prop({ required: true })
  userId!: string;

  @Prop({ required: true })
  expiresAt!: Date;

  @Prop()
  consumedAt?: Date;
}

export const EmailOAuthStateSchema =
  SchemaFactory.createForClass(EmailOAuthState);
EmailOAuthStateSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
