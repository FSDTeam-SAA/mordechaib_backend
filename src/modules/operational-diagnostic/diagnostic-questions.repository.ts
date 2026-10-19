import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model } from 'mongoose';
import { DiagnosticQuestion } from '../../database/schemas/diagnostic-question.schema';

export type DiagnosticQuestionFilters = {
  categoryId?: string;
  search?: string;
  isActive?: boolean;
};

@Injectable()
export class DiagnosticQuestionsRepository {
  constructor(
    @InjectModel(DiagnosticQuestion.name)
    private readonly model: Model<DiagnosticQuestion>,
  ) {}

  create(data: Partial<DiagnosticQuestion>) {
    return this.model.create(data);
  }

  createMany(data: Array<Partial<DiagnosticQuestion>>) {
    return this.model.insertMany(data);
  }

  async list(page: number, limit: number, filters: DiagnosticQuestionFilters) {
    const filter: FilterQuery<DiagnosticQuestion> = {};

    if (filters.categoryId) filter.categoryId = filters.categoryId;
    if (filters.isActive !== undefined) filter.isActive = filters.isActive;
    if (filters.search) {
      const escaped = filters.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter.title = { $regex: escaped, $options: 'i' };
    }

    const [items, total] = await Promise.all([
      this.model
        .find(filter)
        .sort({ order: 1, createdAt: 1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean()
        .exec(),
      this.model.countDocuments(filter).exec(),
    ]);

    return {
      items,
      total,
      page,
      limit,
      pages: Math.max(Math.ceil(total / limit), 1),
    };
  }

  findAllActive() {
    return this.model
      .find({ isActive: true })
      .sort({ order: 1, createdAt: 1 })
      .lean()
      .exec();
  }

  findAllActiveByCategoryIds(categoryIds: string[]) {
    return this.model
      .find({ isActive: true, categoryId: { $in: categoryIds } })
      .sort({ order: 1, createdAt: 1 })
      .lean()
      .exec();
  }

  findById(id: string) {
    return this.model.findById(id).lean().exec();
  }

  findByIds(ids: string[]) {
    return this.model
      .find({ _id: { $in: ids } })
      .lean()
      .exec();
  }

  countByCategoryId(categoryId: string) {
    return this.model.countDocuments({ categoryId }).exec();
  }

  updateById(id: string, update: Partial<DiagnosticQuestion>) {
    return this.model
      .findByIdAndUpdate(id, update, { new: true, runValidators: true })
      .lean()
      .exec();
  }

  deleteById(id: string) {
    return this.model.findByIdAndDelete(id).lean().exec();
  }
}
