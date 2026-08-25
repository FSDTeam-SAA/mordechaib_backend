import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type RecallZoomConnectionDocument =
  HydratedDocument<RecallZoomConnection>;

@Schema({ timestamps: true, collection: 'recall_zoom_connections' })
export class RecallZoomConnection {
  @Prop({ required: true, unique: true, default: 'SIGNED_IN_ZOOM_BOT' })
  key!: string;

  @Prop({ required: true })
  recallOAuthAppId!: string;

  @Prop({ required: true })
  recallCredentialId!: string;

  @Prop({ required: true })
  connectedByUserId!: string;

  @Prop({ required: true, enum: ['CONNECTED', 'DISCONNECTED', 'FAILED'] })
  status!: string;

  @Prop({ type: Object, default: {} })
  metadata?: Record<string, unknown>;
}

export const RecallZoomConnectionSchema =
  SchemaFactory.createForClass(RecallZoomConnection);
