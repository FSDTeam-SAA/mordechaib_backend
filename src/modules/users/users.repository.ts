import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User } from '../../database/schemas/user.schema';

@Injectable()
export class UsersRepository {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<User>,
  ) {}

  findByOrganization(organizationId: string) {
    return this.userModel
      .find({ organizationId })
      .sort({ createdAt: 1 })
      .lean()
      .exec();
  }

  findById(id: string) {
    return this.userModel.findById(id).lean().exec();
  }
}