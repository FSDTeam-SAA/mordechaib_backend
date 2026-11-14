import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import {
  BusinessMemoryKind,
  BusinessMemorySourceType,
  BusinessMemoryStatus,
} from '../../common/enums/business-memory.enum';

export type BusinessMemoryDocument = HydratedDocument<BusinessMemory>;

@Schema({ _id: false })
export class BusinessMemorySource {
  @Prop({ required: true, enum: Object.values(BusinessMemorySourceType) })
  type!: BusinessMemorySourceType;

  /** The organizer message the memory was learned from. */
  @Prop({ trim: true })
  messageId?: string;

  @Prop({ trim: true })
  conversationId?: string;
}

@Schema({ _id: false })
export class BusinessMemoryAgent {
  @Prop({ required: true, trim: true })
  id!: string;

  @Prop({ required: true, trim: true })
  name!: string;

  @Prop({ required: true, trim: true })
  type!: string;
}

/**
 * Long-term business memory for an organization's AI agents. Main Backend is the
 * only store; the AI Backend proposes memories and reads ACTIVE ones back.
 */
@Schema({ timestamps: true, collection: 'business_memories' })
export class BusinessMemory {
  @Prop({ required: true, index: true })
  organizationId!: string;

  @Prop({ required: true, enum: Object.values(BusinessMemoryKind) })
  kind!: BusinessMemoryKind;

  @Prop({
    required: true,
    enum: Object.values(BusinessMemoryStatus),
    default: BusinessMemoryStatus.PENDING_REVIEW,
  })
  status!: BusinessMemoryStatus;

  @Prop({ required: true, trim: true, maxlength: 1000 })
  content!: string;

  /** Main Backend customer (contact) ids the memory is about. */
  @Prop({ type: [String], default: [] })
  contactIds!: string[];

  /** Team members the memory is about (for example who is responsible). */
  @Prop({ type: [String], default: [] })
  userIds!: string[];

  /** Local due date (YYYY-MM-DD) of a commitment or open item. */
  @Prop({ trim: true })
  dueOn?: string;

  @Prop({ type: BusinessMemorySource, required: true })
  source!: BusinessMemorySource;

  @Prop({ type: BusinessMemoryAgent })
  proposedByAgent?: BusinessMemoryAgent;

  /** sha256 of kind + normalized content: one memory per fact, even after a rejection. */
  @Prop({ required: true })
  fingerprint!: string;

  @Prop()
  createdByUserId?: string;

  @Prop()
  reviewedByUserId?: string;

  @Prop()
  reviewedAt?: Date;

  @Prop()
  archivedAt?: Date;

  @Prop()
  archivedByUserId?: string;

  createdAt?: Date;
  updatedAt?: Date;
}

export const BusinessMemorySchema =
  SchemaFactory.createForClass(BusinessMemory);
BusinessMemorySchema.index(
  { organizationId: 1, fingerprint: 1 },
  { unique: true },
);
BusinessMemorySchema.index({ organizationId: 1, status: 1, updatedAt: -1 });
BusinessMemorySchema.index({ organizationId: 1, status: 1, contactIds: 1 });
// Every text search is scoped to one organization (equality prefix).
BusinessMemorySchema.index({ organizationId: 1, content: 'text' });
