import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { SetupFeeType } from '../../common/enums/setup-fee-type.enum';
import { SetupType } from '../../common/enums/setup-type.enum';

export type SetupPackageDocument = HydratedDocument<SetupPackage>;

export class SetupPackagePriceHistoryEntry {
  @Prop({ required: true, min: 0 })
  previousPrice!: number;

  @Prop({ required: true, min: 0 })
  nextPrice!: number;

  @Prop({ required: true, uppercase: true, trim: true })
  previousCurrency!: string;

  @Prop({ required: true, uppercase: true, trim: true })
  nextCurrency!: string;

  @Prop({ required: true })
  changedBy!: string;

  @Prop({ default: () => new Date() })
  changedAt!: Date;
}

@Schema({ timestamps: true, collection: 'setup_packages' })
export class SetupPackage {
  @Prop({
    required: true,
    unique: true,
    uppercase: true,
    trim: true,
    index: true,
  })
  code!: string;

  @Prop({ required: true, trim: true })
  name!: string;

  @Prop({ trim: true })
  description?: string;

  @Prop({ required: true, enum: Object.values(SetupType) })
  setupType!: SetupType;

  @Prop({ required: true, enum: Object.values(SetupFeeType) })
  setupFeeType!: SetupFeeType;

  @Prop({ required: true, min: 0 })
  price!: number;

  @Prop({ required: true, uppercase: true, trim: true, default: 'USD' })
  currency!: string;

  @Prop({ required: true, default: false })
  paymentRequired!: boolean;

  @Prop({ required: true, default: false })
  meetingRequired!: boolean;

  @Prop({ default: true, index: true })
  isActive!: boolean;

  @Prop({ default: 0 })
  sortOrder!: number;

  @Prop({ type: [SetupPackagePriceHistoryEntry], default: [] })
  priceHistory!: SetupPackagePriceHistoryEntry[];

  @Prop({ required: true })
  createdBy!: string;

  @Prop({ required: true })
  updatedBy!: string;
}

export const SetupPackageSchema = SchemaFactory.createForClass(SetupPackage);
SetupPackageSchema.index({ isActive: 1, sortOrder: 1 });
