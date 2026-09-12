import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { AgentType } from '../../common/enums/agent-type.enum';
import { AgentStatus } from '../../common/enums/agent-status.enum';

export type AgentDocument = HydratedDocument<Agent>;

/**
 * A platform-managed AI agent profile. Agents are shared across customer
 * organizations; execution, runs, tools, and prompts belong to the AI
 * service, not to this catalog.
 */
@Schema({ timestamps: true, collection: 'agents' })
export class Agent {
  @Prop({ required: true, trim: true, minlength: 1, maxlength: 120 })
  name!: string;

  // Lowercase canonical form used to enforce a platform-wide
  // case-insensitive unique name.
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

  @Prop({
    required: true,
    enum: Object.values(AgentStatus),
    default: AgentStatus.ACTIVE,
    index: true,
  })
  status!: AgentStatus;

  // Monotonic catalog version used by the AI service to ignore stale events.
  @Prop({ required: true, min: 1, default: 1 })
  version!: number;

  @Prop()
  disabledAt?: Date;
}

export const AgentSchema = SchemaFactory.createForClass(Agent);

AgentSchema.index({ nameKey: 1 }, { unique: true });
AgentSchema.index({ status: 1, type: 1, createdAt: -1 });
