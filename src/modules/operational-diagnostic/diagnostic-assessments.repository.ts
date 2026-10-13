import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model } from 'mongoose';
import { DiagnosticAssessment } from '../../database/schemas/diagnostic-assessment.schema';

export type AssessmentAdminFilters = {
  organizationId?: string;
  userId?: string;
  dateFrom?: Date;
  dateTo?: Date;
};

@Injectable()
export class DiagnosticAssessmentsRepository {
  constructor(
    @InjectModel(DiagnosticAssessment.name)
    private readonly model: Model<DiagnosticAssessment>,
  ) {}

  create(data: Partial<DiagnosticAssessment>) {
    return this.model.create(data);
  }

  async listForAdmin(
    page: number,
    limit: number,
    filters: AssessmentAdminFilters,
  ) {
    const filter: FilterQuery<DiagnosticAssessment> = {};

    if (filters.organizationId) filter.organizationId = filters.organizationId;
    if (filters.userId) filter.userId = filters.userId;
    if (filters.dateFrom || filters.dateTo) {
      filter.completedAt = {
        ...(filters.dateFrom ? { $gte: filters.dateFrom } : {}),
        ...(filters.dateTo ? { $lte: filters.dateTo } : {}),
      };
    }

    const [items, total] = await Promise.all([
      this.model
        .find(filter)
        .sort({ createdAt: -1 })
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

  findById(id: string) {
    return this.model.findById(id).lean().exec();
  }

  async listForUser(
    organizationId: string,
    userId: string,
    page: number,
    limit: number,
  ) {
    const filter: FilterQuery<DiagnosticAssessment> = {
      organizationId,
      userId,
    };

    const [items, total] = await Promise.all([
      this.model
        .find(filter)
        .sort({ createdAt: -1 })
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

  findLatestForUser(organizationId: string, userId: string) {
    return this.model
      .findOne({ organizationId, userId })
      .sort({ createdAt: -1 })
      .lean()
      .exec();
  }

  findByIdAndUser(id: string, organizationId: string, userId: string) {
    return this.model
      .findOne({ _id: id, organizationId, userId })
      .lean()
      .exec();
  }
}

