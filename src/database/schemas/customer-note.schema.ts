import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { CustomerNoteSource } from '../../common/enums/customer-note-source.enum';

export type CustomerNoteDocument = HydratedDocument<CustomerNote>;

@Schema({ timestamps: true, collection: 'customer_notes' })
export class CustomerNote {
  @Prop({ required: true, index: true })
  organizationId!: string;

  @Prop({ required: true, index: true })
  contactId!: string;

  @Prop({ required: true })
  createdByUserId!: string;

  @Prop({ required: true, trim: true, minlength: 1, maxlength: 10_000 })
  content!: string;

  @Prop({
    required: true,
    enum: Object.values(CustomerNoteSource),
    default: CustomerNoteSource.MANUAL,
  })
  source!: CustomerNoteSource;

  @Prop({ required: true, default: 1, min: 1 })
  revision!: number;

  @Prop()
  updatedByUserId?: string;

  @Prop()
  deletedAt?: Date;

  @Prop()
  deletedByUserId?: string;
}

export const CustomerNoteSchema = SchemaFactory.createForClass(CustomerNote);
CustomerNoteSchema.index({
  organizationId: 1,
  contactId: 1,
  deletedAt: 1,
  createdAt: -1,
  _id: -1,
});
