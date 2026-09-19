import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { SetupPackage } from '../../database/schemas/setup-package.schema';

@Injectable()
export class SetupPackagesRepository {
  constructor(
    @InjectModel(SetupPackage.name)
    private readonly setupPackageModel: Model<SetupPackage>,
  ) {}

  findAll(includeInactive: boolean) {
    return this.setupPackageModel
      .find(includeInactive ? {} : { isActive: true })
      .sort({ sortOrder: 1, name: 1 })
      .lean()
      .exec();
  }

  findPublicCatalog() {
    return this.setupPackageModel
      .find({ isActive: true })
      .select('-priceHistory -createdBy -updatedBy')
      .sort({ sortOrder: 1, name: 1 })
      .lean()
      .exec();
  }

  findById(id: string) {
    return this.setupPackageModel.findById(id).lean().exec();
  }

  findByCode(code: string) {
    return this.setupPackageModel.findOne({ code }).lean().exec();
  }

  create(input: Record<string, unknown>) {
    return this.setupPackageModel.create(input);
  }

  updateById(id: string, input: Record<string, unknown>) {
    return this.setupPackageModel
      .findByIdAndUpdate(id, input, { new: true, runValidators: true })
      .lean()
      .exec();
  }
}
