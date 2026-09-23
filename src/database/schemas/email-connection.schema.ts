import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { EmailProvider } from '../../common/enums/email-provider.enum';

export type EmailConnectionDocument = HydratedDocument<EmailConnection>;

@Schema({ timestamps: true, collection: 'email_connections' })
export class EmailConnection {
  @Prop({ required: true, index: true })
  organizationId!: string;

  @Prop({ required: true, index: true })
  userId!: string;

  @Prop({ required: true, enum: Object.values(EmailProvider) })
  provider!: EmailProvider;

  @Prop({ required: true, enum: ['CONNECTED', 'DISCONNECTED'] })
  status!: 'CONNECTED' | 'DISCONNECTED';

  @Prop({ required: true, trim: true })
  email!: string;

  @Prop({ required: true, trim: true })
  providerAccountId!: string;

  @Prop({ type: [String], default: [] })
  scopes!: string[];

  @Prop({ select: false })
  accessToken?: string;

  @Prop({ select: false })
  refreshToken?: string;

  @Prop()
  expiresAt?: Date;

  @Prop()
  disconnectedAt?: Date;
}

export const EmailConnectionSchema =
  SchemaFactory.createForClass(EmailConnection);
EmailConnectionSchema.index(
  { organizationId: 1, userId: 1, provider: 1 },
  { unique: true },
);
