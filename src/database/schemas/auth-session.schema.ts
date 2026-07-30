import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type AuthSessionDocument = HydratedDocument<AuthSession>;

@Schema({ timestamps: true, collection: 'auth_sessions' })
export class AuthSession {
  @Prop({ required: true, index: true })
  userId!: string;

  @Prop({ required: true, index: true })
  familyId!: string;

  @Prop({ required: true, unique: true })
  refreshTokenHash!: string;

  @Prop({ default: false })
  rememberMe!: boolean;

  @Prop({ required: true })
  expiresAt!: Date;

  @Prop()
  revokedAt?: Date;

  @Prop()
  revokeReason?: string;

  @Prop()
  replacedBySessionId?: string;

  @Prop()
  userAgent?: string;

  @Prop()
  ipAddress?: string;
}

export const AuthSessionSchema = SchemaFactory.createForClass(AuthSession);
AuthSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
AuthSessionSchema.index({ userId: 1, revokedAt: 1, expiresAt: 1 });
