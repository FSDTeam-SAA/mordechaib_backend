import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type OrganizationAgentSettingDocument =
  HydratedDocument<OrganizationAgentSetting>;

/**
 * Organization-owned policy for a platform agent. The global `agents`
 * collection remains the catalog source of truth; this collection stores
 * only tenant-specific overrides.
 */
@Schema({ timestamps: true, collection: 'organization_agent_settings' })
export class OrganizationAgentSetting {
  @Prop({ required: true, index: true })
  organizationId!: string;

  @Prop({ required: true, trim: true, index: true })
  agentId!: string;

  @Prop({ required: true, default: true })
  enabled!: boolean;

  @Prop({ min: 1, max: 100 })
  concurrencyLimit?: number;

  @Prop({ required: true, default: true })
  approvalRequired!: boolean;

  @Prop({ required: true, trim: true })
  updatedByUserId!: string;
}

export const OrganizationAgentSettingSchema = SchemaFactory.createForClass(
  OrganizationAgentSetting,
);

OrganizationAgentSettingSchema.index(
  { organizationId: 1, agentId: 1 },
  { unique: true },
);
