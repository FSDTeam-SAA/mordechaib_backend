import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { CustomerContactStatus } from '../../common/enums/customer-contact-status.enum';

export type CustomerContactDocument = HydratedDocument<CustomerContact>;

@Schema({ timestamps: true, collection: 'customer_contacts' })
export class CustomerContact {
  @Prop({ required: true, index: true })
  organizationId!: string;

  @Prop({ required: true, index: true })
  createdByUserId!: string;

  @Prop({ required: true, trim: true, minlength: 1, maxlength: 200 })
  name!: string;

  @Prop({ trim: true, lowercase: true, maxlength: 320 })
  email?: string;

  @Prop({ trim: true, maxlength: 32 })
  phone?: string;

  @Prop({ trim: true, maxlength: 200 })
  company?: string;

  @Prop({ trim: true, maxlength: 200 })
  jobTitle?: string;

  @Prop({ trim: true, maxlength: 5000 })
  notes?: string;

  @Prop({ type: [String], default: [] })
  tags!: string[];

  @Prop({
    required: true,
    enum: Object.values(CustomerContactStatus),
    default: CustomerContactStatus.ACTIVE,
    index: true,
  })
  status!: CustomerContactStatus;

  @Prop()
  archivedAt?: Date;

  @Prop()
  archivedByUserId?: string;
}

export const CustomerContactSchema =
  SchemaFactory.createForClass(CustomerContact);
CustomerContactSchema.index({ organizationId: 1, status: 1, updatedAt: -1 });
CustomerContactSchema.index(
  { organizationId: 1, email: 1 },
  {
    unique: true,
    partialFilterExpression: {
      status: CustomerContactStatus.ACTIVE,
      email: { $type: 'string' },
    },
  },
);
CustomerContactSchema.index(
  { organizationId: 1, phone: 1 },
  {
    unique: true,
    partialFilterExpression: {
      status: CustomerContactStatus.ACTIVE,
      phone: { $type: 'string' },
    },
  },
);
