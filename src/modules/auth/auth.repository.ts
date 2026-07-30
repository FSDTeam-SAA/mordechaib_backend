import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { UserRole } from '../../common/enums/user-role.enum';
import { User, UserDocument } from '../../database/schemas/user.schema';

@Injectable()
export class AuthRepository {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<User>,
  ) {}

  findByEmail(email: string) {
    return this.userModel.findOne({ email }).exec();
  }

  findByEmailWithPassword(email: string) {
    return this.userModel.findOne({ email }).select('+passwordHash').exec();
  }

  findById(id: string) {
    return this.userModel.findById(id).exec();
  }

  findByIdWithPassword(id: string) {
    return this.userModel.findById(id).select('+passwordHash').exec();
  }

  create(input: {
    organizationId: string;
    firstName: string;
    lastName: string;
    email: string;
    passwordHash: string;
    termsAcceptedAt: Date;
  }): Promise<UserDocument> {
    return this.userModel.create({ ...input, role: UserRole.OWNER });
  }

  updateLastLogin(id: string) {
    return this.userModel
      .findByIdAndUpdate(id, { lastLoginAt: new Date() })
      .exec();
  }

  markEmailVerified(id: string) {
    return this.userModel
      .findByIdAndUpdate(id, { emailVerifiedAt: new Date() }, { new: true })
      .exec();
  }

  updatePassword(id: string, passwordHash: string) {
    return this.userModel
      .findByIdAndUpdate(
        id,
        { passwordHash, passwordChangedAt: new Date() },
        { new: true },
      )
      .exec();
  }

  updateProfile(id: string, input: { firstName?: string; lastName?: string }) {
    return this.userModel.findByIdAndUpdate(id, input, { new: true }).exec();
  }
}
