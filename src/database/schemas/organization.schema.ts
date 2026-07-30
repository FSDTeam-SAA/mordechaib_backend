import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type OrganizationDocument = HydratedDocument<Organization>;

@Schema({ timestamps: true, collection: 'organizations' })
export class Organization {
  @Prop({ required: true, trim: true })
  name!: string;

  @Prop({ default: 'UTC' })
  timezone!: string;

  @Prop({ default: 'ACTIVE' })
  status!: string;

  @Prop({ default: 'STARTER' })
  plan!: string;
}

export const OrganizationSchema = SchemaFactory.createForClass(Organization);
