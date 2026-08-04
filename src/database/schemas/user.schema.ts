import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { UserRole } from '../../common/enums/user-role.enum';
import { UserStatus } from '../../common/enums/user-status.enum';

export type UserDocument = HydratedDocument<User>;

@Schema({ timestamps: true, collection: 'users' })
export class User {
  @Prop({ required: true, index: true })
  organizationId!: string;

  @Prop({ required: true, lowercase: true, trim: true, unique: true })
  email!: string;

  @Prop({ required: true, trim: true })
  firstName!: string;

  @Prop({ required: true, trim: true })
  lastName!: string;

  @Prop({ required: true, select: false })
  passwordHash!: string;

  @Prop({ default: UserRole.OWNER, enum: Object.values(UserRole) })
  role!: UserRole;

  @Prop({
    default: UserStatus.ACTIVE,
    enum: Object.values(UserStatus),
    index: true,
  })
  status!: UserStatus;

  @Prop({ default: false, index: true })
  isPlatformAdmin!: boolean;

  @Prop()
  emailVerifiedAt?: Date;

  @Prop({ required: true })
  termsAcceptedAt!: Date;

  @Prop()
  lastLoginAt?: Date;

  @Prop()
  passwordChangedAt?: Date;
}

export const UserSchema = SchemaFactory.createForClass(User);
UserSchema.index({ organizationId: 1, email: 1 });
