import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { AiResponseStyle } from '../../common/enums/ai-response-style.enum';

export type AiSettingDocument = HydratedDocument<AiSetting>;

@Schema({ timestamps: true, collection: 'ai_settings' })
export class AiSetting {
  @Prop({ required: true, unique: true, index: true })
  organizationId!: string;

  @Prop({ default: false })
  autoApproveLowRiskActions!: boolean;

  @Prop({ default: true })
  learningMode!: boolean;

  @Prop({ default: true })
  agentActivityNotifications!: boolean;

  @Prop({
    default: AiResponseStyle.PROFESSIONAL,
    enum: Object.values(AiResponseStyle),
  })
  responseStyle!: AiResponseStyle;

  @Prop()
  updatedBy?: string;
}

export const AiSettingSchema = SchemaFactory.createForClass(AiSetting);
