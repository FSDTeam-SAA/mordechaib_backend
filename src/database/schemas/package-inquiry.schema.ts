import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { PackageInquiryStatus } from '../../common/enums/package-inquiry-status.enum';
import { PackageType } from '../../common/enums/package-type.enum';

export type PackageInquiryDocument = HydratedDocument<PackageInquiry>;

@Schema({ timestamps: true, collection: 'package_inquiries' })
export class PackageInquiry {
  @Prop({
    default: PackageType.AI_BUSINESS_LAUNCH,
    enum: Object.values(PackageType),
  })
  packageType!: PackageType;

  @Prop({ required: true, trim: true })
  fullName!: string;

  @Prop({ required: true, lowercase: true, trim: true, index: true })
  email!: string;

  @Prop({ required: true, trim: true })
  message!: string;

  @Prop({ required: true })
  consentAcceptedAt!: Date;

  @Prop({
    default: PackageInquiryStatus.SUBMITTED,
    enum: Object.values(PackageInquiryStatus),
    index: true,
  })
  status!: PackageInquiryStatus;
}

export const PackageInquirySchema =
  SchemaFactory.createForClass(PackageInquiry);
