import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { DiagnosticCategory } from '../../database/schemas/diagnostic-category.schema';

@Injectable()
export class DiagnosticCategoriesRepository {
  constructor(
    @InjectModel(DiagnosticCategory.name)
    private readonly model: Model<DiagnosticCategory>,
  ) {}

  create(data: Partial<DiagnosticCategory>) {
    return this.model.create(data);
  }

  findAll(includeInactive = false) {
    const filter = includeInactive ? {} : { isActive: true };
    return this.model.find(filter).sort({ order: 1, createdAt: 1 }).lean().exec();
  }

  findById(id: string) {
    return this.model.findById(id).lean().exec();
  }

  updateById(id: string, update: Partial<DiagnosticCategory>) {
    return this.model
      .findByIdAndUpdate(id, update, { new: true, runValidators: true })
      .lean()
      .exec();
  }

  deleteById(id: string) {
    return this.model.findByIdAndDelete(id).lean().exec();
  }
}

