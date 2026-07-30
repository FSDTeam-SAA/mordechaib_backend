import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { AuthTokenType } from '../../common/enums/auth-token-type.enum';

export type AuthTokenDocument = HydratedDocument<AuthToken>;

@Schema({ timestamps: true, collection: 'auth_tokens' })
export class AuthToken {
  @Prop({ required: true, index: true })
  userId!: string;

  @Prop({ required: true, enum: Object.values(AuthTokenType), index: true })
  type!: AuthTokenType;

  @Prop({ required: true, unique: true })
  tokenHash!: string;

  @Prop({ required: true })
  expiresAt!: Date;

  @Prop()
  consumedAt?: Date;
}

export const AuthTokenSchema = SchemaFactory.createForClass(AuthToken);
AuthTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
AuthTokenSchema.index({ userId: 1, type: 1, consumedAt: 1 });
