import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type AdminMeetingOperationLeaseDocument =
  HydratedDocument<AdminMeetingOperationLease>;

@Schema({
  timestamps: true,
  collection: 'admin_meeting_operation_leases',
})
export class AdminMeetingOperationLease {
  @Prop({ required: true, unique: true, index: true, maxlength: 300 })
  key!: string;

  @Prop({ required: true, maxlength: 50 })
  operation!: string;

  @Prop({ required: true, maxlength: 100 })
  token!: string;

  @Prop({ required: true })
  expiresAt!: Date;

  @Prop({ required: true, maxlength: 100 })
  actorUserId!: string;
}

export const AdminMeetingOperationLeaseSchema = SchemaFactory.createForClass(
  AdminMeetingOperationLease,
);
AdminMeetingOperationLeaseSchema.index(
  { expiresAt: 1 },
  { expireAfterSeconds: 0 },
);
