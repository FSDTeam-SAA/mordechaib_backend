import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { ContactEnquiryStatus } from '../../common/enums/contact-enquiry-status.enum';

export type ContactEnquiryDocument = HydratedDocument<ContactEnquiry>;

@Schema({ timestamps: true, collection: 'contact_enquiries' })
export class ContactEnquiry {
  @Prop({ required: true, unique: true, index: true, trim: true })
  referenceId!: string;

  @Prop({ trim: true, index: true, select: false })
  clientRequestId?: string;

  @Prop({ trim: true, select: false })
  requestHash?: string;

  @Prop({ required: true, trim: true, minlength: 2, maxlength: 160 })
  fullName!: string;

  @Prop({ required: true, trim: true, lowercase: true, maxlength: 254, index: true })
  email!: string;

  @Prop({ trim: true, maxlength: 200 })
  company?: string;

  @Prop({ trim: true, maxlength: 160 })
  role?: string;

  @Prop({ required: true, trim: true, minlength: 10, maxlength: 5000 })
  message!: string;

  @Prop({ required: true })
  consentAcceptedAt!: Date;

  @Prop({
    required: true,
    enum: Object.values(ContactEnquiryStatus),
    default: ContactEnquiryStatus.NEW,
    index: true,
  })
  status!: ContactEnquiryStatus;

  @Prop({ trim: true, maxlength: 5000 })
  internalNote?: string;

  @Prop()
  statusChangedAt?: Date;

  @Prop()
  statusChangedByUserId?: string;

  @Prop({ required: true, default: 1, min: 1 })
  revision!: number;

  @Prop({ index: true })
  deletedAt?: Date;

  @Prop()
  deletedByUserId?: string;
}

export const ContactEnquirySchema =
  SchemaFactory.createForClass(ContactEnquiry);
ContactEnquirySchema.index({ status: 1, deletedAt: 1, createdAt: -1 });
ContactEnquirySchema.index({ email: 1, deletedAt: 1, createdAt: -1 });
ContactEnquirySchema.index(
  { clientRequestId: 1 },
  {
    unique: true,
    partialFilterExpression: { clientRequestId: { $type: 'string' } },
  },
);
