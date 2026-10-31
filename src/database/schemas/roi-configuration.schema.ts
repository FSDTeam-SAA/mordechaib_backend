import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type RoiConfigurationDocument = HydratedDocument<RoiConfiguration>;

@Schema({ timestamps: true, collection: 'roi_configurations' })
export class RoiConfiguration {
  createdAt?: Date;
  updatedAt?: Date;

  @Prop({ required: true, unique: true, index: true })
  organizationId!: string;

  @Prop({ required: true, default: '1.0', trim: true })
  methodologyVersion!: string;

  @Prop({ required: true, default: 15, min: 0, max: 1440 })
  taskCreationMinutes!: number;

  @Prop({ required: true, default: 20, min: 0, max: 1440 })
  meetingSchedulingMinutes!: number;

  @Prop({ required: true, default: 5, min: 0, max: 1440 })
  crmUpdateMinutes!: number;

  @Prop({ required: true, default: 10, min: 0, max: 1440 })
  emailDraftMinutes!: number;

  @Prop({ required: true, default: 25, min: 0, max: 10000 })
  hourlyLaborCost!: number;

  @Prop({ required: true, default: 'USD', trim: true, uppercase: true })
  currency!: string;

  @Prop({ required: true })
  updatedBy!: string;
}

export const RoiConfigurationSchema =
  SchemaFactory.createForClass(RoiConfiguration);
