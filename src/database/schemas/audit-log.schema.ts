import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type AuditLogDocument = HydratedDocument<AuditLog>;

@Schema({ timestamps: true, collection: 'audit_logs' })
export class AuditLog {
  @Prop({ required: true, index: true })
  organizationId!: string;

  @Prop({})
  userId?: string;

  @Prop({ required: true })
  action!: string;

  @Prop()
  resourceType?: string;

  @Prop()
  resourceId?: string;

  @Prop({ type: Object, default: {} })
  metadata?: Record<string, unknown>;
}

export const AuditLogSchema = SchemaFactory.createForClass(AuditLog);
AuditLogSchema.index({ organizationId: 1, createdAt: -1 });
