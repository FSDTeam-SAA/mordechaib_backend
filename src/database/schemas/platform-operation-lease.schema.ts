import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type PlatformOperationLeaseDocument =
  HydratedDocument<PlatformOperationLease>;

@Schema({ timestamps: true, collection: 'platform_operation_leases' })
export class PlatformOperationLease {
  @Prop({ required: true, unique: true, index: true, maxlength: 300 })
  key!: string;

  @Prop({ required: true, maxlength: 80 })
  operation!: string;

  @Prop({ required: true, maxlength: 100 })
  token!: string;

  @Prop({ required: true, maxlength: 100 })
  actorUserId!: string;

  @Prop({ required: true })
  expiresAt!: Date;
}

export const PlatformOperationLeaseSchema = SchemaFactory.createForClass(
  PlatformOperationLease,
);
PlatformOperationLeaseSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
