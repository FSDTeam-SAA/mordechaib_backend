import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import {
  AgentActivityStatus,
  AgentOperationType,
} from '../../common/enums/agent-activity.enum';
import { AgentType } from '../../common/enums/agent-type.enum';

export type AgentActivityDocument = HydratedDocument<AgentActivity>;

@Schema({ timestamps: true, collection: 'agent_activities' })
export class AgentActivity {
  @Prop({ required: true, index: true })
  organizationId!: string;

  @Prop({ trim: true, maxlength: 128, index: true })
  agentId?: string;

  @Prop({ trim: true, maxlength: 200 })
  agentName?: string;

  @Prop({ enum: Object.values(AgentType), index: true })
  agentType?: AgentType;

  @Prop({
    required: true,
    enum: Object.values(AgentOperationType),
    index: true,
  })
  operationType!: AgentOperationType;

  @Prop({ required: true, trim: true, maxlength: 200, index: true })
  jobId!: string;

  @Prop({ trim: true, maxlength: 200 })
  runId?: string;

  @Prop({ trim: true, maxlength: 64, index: true })
  sourceType?: string;

  @Prop({ trim: true, maxlength: 200, index: true })
  sourceId?: string;

  @Prop({
    required: true,
    enum: Object.values(AgentActivityStatus),
    index: true,
  })
  status!: AgentActivityStatus;

  @Prop({ required: true })
  startedAt!: Date;

  @Prop()
  completedAt?: Date;

  @Prop({ min: 0 })
  latencyMs?: number;

  @Prop({ min: 1, default: 1 })
  attempt!: number;

  @Prop({ trim: true, maxlength: 100 })
  failureCode?: string;

  @Prop({ trim: true, maxlength: 1000 })
  failureMessage?: string;

  @Prop({ type: Object, default: {} })
  metadata!: Record<string, unknown>;
}

export const AgentActivitySchema = SchemaFactory.createForClass(AgentActivity);
AgentActivitySchema.index({ organizationId: 1, startedAt: -1, _id: -1 });
AgentActivitySchema.index({ organizationId: 1, status: 1, startedAt: -1 });
AgentActivitySchema.index({ organizationId: 1, agentId: 1, startedAt: -1 });
AgentActivitySchema.index(
  { organizationId: 1, jobId: 1, attempt: 1 },
  { unique: true },
);
