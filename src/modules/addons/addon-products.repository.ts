import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AddonProduct } from '../../database/schemas/addon-product.schema';
import { CreateAddonProductDto } from './dto/create-addon-product.dto';
import { UpdateAddonProductDto } from './dto/update-addon-product.dto';

@Injectable()
export class AddonProductsRepository {
  constructor(
    @InjectModel(AddonProduct.name)
    private readonly model: Model<AddonProduct>,
  ) {}

  findAll(includeInactive: boolean) {
    const filter = includeInactive ? {} : { isActive: true };
    return this.model.find(filter).sort({ sortOrder: 1 }).exec();
  }

  findById(id: string) {
    return this.model.findById(id).exec();
  }

  findByCategory(category: string) {
    return this.model.findOne({ category }).exec();
  }

  create(input: CreateAddonProductDto & { tiers: AddonProduct['tiers'] }) {
    return this.model.create(input);
  }

  updateById(id: string, input: Partial<UpdateAddonProductDto & { tiers: AddonProduct['tiers'] }>) {
    return this.model.findByIdAndUpdate(id, input, { new: true }).exec();
  }

  deleteById(id: string) {
    return this.model.findByIdAndDelete(id).exec();
  }
}
