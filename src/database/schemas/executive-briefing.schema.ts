import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import {
  ExecutiveBriefingStatus,
  ExecutiveBriefingType,
} from '../../common/enums/executive-briefing.enum';

export type ExecutiveBriefingDocument = HydratedDocument<ExecutiveBriefing>;

@Schema({ _id: false })
export class ExecutiveBriefingPeriod {
  @Prop({ required: true })
  start!: Date;

  @Prop({ required: true })
  end!: Date;

  @Prop({ required: true, trim: true, maxlength: 100 })
  timezone!: string;
}

export const ExecutiveBriefingPeriodSchema = SchemaFactory.createForClass(
  ExecutiveBriefingPeriod,
);

@Schema({ timestamps: true, collection: 'executive_briefings' })
export class ExecutiveBriefing {
  @Prop({ required: true, index: true })
  organizationId!: string;

  @Prop({ required: true, index: true })
  requesterUserId!: string;

  @Prop({ required: true, trim: true, maxlength: 64 })
  requesterScopeHash!: string;

  @Prop({ required: true, trim: true, maxlength: 20, default: '1.0' })
  schemaVersion!: string;

  @Prop({
    required: true,
    enum: Object.values(ExecutiveBriefingType),
    index: true,
  })
  briefingType!: ExecutiveBriefingType;

  @Prop({ type: ExecutiveBriefingPeriodSchema, required: true })
  period!: ExecutiveBriefingPeriod;

  @Prop({ required: true, trim: true, maxlength: 300, unique: true })
  jobId!: string;

  @Prop({ required: true, trim: true, maxlength: 400, unique: true })
  idempotencyKey!: string;

  @Prop({ required: true, trim: true, maxlength: 64 })
  inputHash!: string;

  @Prop({ type: Object, required: true, select: false })
  input!: Record<string, unknown>;

  @Prop({
    required: true,
    enum: Object.values(ExecutiveBriefingStatus),
    default: ExecutiveBriefingStatus.QUEUED,
    index: true,
  })
  status!: ExecutiveBriefingStatus;

  @Prop({ type: Object })
  content?: Record<string, unknown>;

  @Prop({ type: [Object], default: [] })
  sourceRefs!: Array<Record<string, unknown>>;

  @Prop({ min: 0, max: 1 })
  confidence?: number;

  @Prop({ trim: true, maxlength: 100 })
  failureCode?: string;

  @Prop({ trim: true, maxlength: 2000 })
  failureMessage?: string;

  @Prop({ default: false })
  failureRetryable?: boolean;

  @Prop({ required: true, default: 0, min: 0 })
  attemptCount!: number;

  @Prop()
  generationStartedAt?: Date;

  @Prop()
  completedAt?: Date;
}

export const ExecutiveBriefingSchema =
  SchemaFactory.createForClass(ExecutiveBriefing);

ExecutiveBriefingSchema.index({
  organizationId: 1,
  requesterUserId: 1,
  briefingType: 1,
  'period.start': -1,
});
ExecutiveBriefingSchema.index(
  {
    organizationId: 1,
    requesterUserId: 1,
    requesterScopeHash: 1,
    briefingType: 1,
    'period.start': 1,
    'period.end': 1,
    inputHash: 1,
  },
  { unique: true },
);
