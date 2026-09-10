import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { AgentType } from '../../common/enums/agent-type.enum';

export type AgentDocument = HydratedDocument<Agent>;

/**
 * An organization-owned AI agent profile. This module deliberately stores
 * profile metadata only; AI execution, runs, tools, and prompts belong to the
 * AI service, not to this catalog.
 */
@Schema({ timestamps: true, collection: 'agents' })
export class Agent {
  @Prop({ required: true, index: true })
  organizationId!: string;

  @Prop({ required: true, trim: true, minlength: 1, maxlength: 120 })
  name!: string;

  // Lowercase canonical form used only to enforce a case-insensitive unique
  // name inside an organization.
  @Prop({ required: true, lowercase: true, trim: true, maxlength: 120 })
  nameKey!: string;

  @Prop({ trim: true, maxlength: 500 })
  imageUrl?: string;

  @Prop({
    required: true,
    enum: Object.values(AgentType),
    index: true,
  })
  type!: AgentType;
}

export const AgentSchema = SchemaFactory.createForClass(Agent);

AgentSchema.index({ organizationId: 1, nameKey: 1 }, { unique: true });
AgentSchema.index({ organizationId: 1, type: 1, createdAt: -1 });
