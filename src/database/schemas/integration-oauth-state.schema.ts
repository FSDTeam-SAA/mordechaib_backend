import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type IntegrationOAuthStateDocument =
  HydratedDocument<IntegrationOAuthState>;

@Schema({ timestamps: true, collection: 'integration_oauth_states' })
export class IntegrationOAuthState {
  @Prop({ required: true, unique: true, index: true, select: false })
  nonceHash!: string;

  @Prop({ required: true, index: true })
  provider!: string;

  @Prop({ required: true, index: true })
  organizationId!: string;

  @Prop({ required: true, index: true })
  userId!: string;

  @Prop({ required: true })
  expiresAt!: Date;

  @Prop()
  consumedAt?: Date;
}

export const IntegrationOAuthStateSchema = SchemaFactory.createForClass(
  IntegrationOAuthState,
);
IntegrationOAuthStateSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
