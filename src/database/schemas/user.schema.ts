import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type UserDocument = HydratedDocument<User>;

@Schema({ timestamps: true, collection: 'users' })
export class User {
  @Prop({ required: true, index: true })
  organizationId!: string;

  @Prop({ required: true, lowercase: true, trim: true, unique: true })
  email!: string;

  @Prop({ trim: true })
  name?: string;

  @Prop()
  passwordHash?: string;

  @Prop({ default: 'CEO', enum: ['CEO', 'ADMIN', 'MEMBER', 'VIEWER'] })
  role!: string;
}

export const UserSchema = SchemaFactory.createForClass(User);
