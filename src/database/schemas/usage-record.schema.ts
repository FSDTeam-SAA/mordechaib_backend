import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type UsageRecordDocument = HydratedDocument<UsageRecord>;

@Schema({ timestamps: true, collection: 'usage_records' })
export class UsageRecord {
  @Prop({ required: true, index: true })
  organizationId!: string;

  @Prop({ required: true })
  provider!: string;

  @Prop({ required: true })
  metric!: string;

  @Prop({ required: true, default: 0 })
  quantity!: number;

  @Prop({ required: true })
  unit!: string;

  @Prop({ default: 0 })
  cost?: number;

  @Prop()
  periodStart?: Date;

  @Prop()
  periodEnd?: Date;
}

export const UsageRecordSchema = SchemaFactory.createForClass(UsageRecord);
UsageRecordSchema.index({ organizationId: 1, provider: 1, metric: 1 });
