import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { PackageInquiry } from '../../database/schemas/package-inquiry.schema';
import { PackageInquiryStatus } from '../../common/enums/package-inquiry-status.enum';
import { PackageType } from '../../common/enums/package-type.enum';
import { CreatePackageInquiryDto } from './dto/create-package-inquiry.dto';

type ListQueriesFilter = {
  packageType?: PackageType;
  status?: PackageInquiryStatus;
  search?: string;
  page: number;
  limit: number;
};

@Injectable()
export class PackageInquiriesRepository {
  constructor(
    @InjectModel(PackageInquiry.name)
    private readonly inquiryModel: Model<PackageInquiry>,
  ) {}

  create(
    input: CreatePackageInquiryDto & {
      packageType?: PackageType;
      organizationId?: string;
      subject?: string;
    },
  ) {
    return this.inquiryModel.create({
      packageType: input.packageType,
      organizationId: input.organizationId,
      fullName: input.fullName.trim(),
      email: input.email,
      message: input.message.trim(),
      subject: input.subject,
      consentAcceptedAt: new Date(),
    });
  }

  async list(filter: ListQueriesFilter) {
    const query: Record<string, unknown> = {};
    if (filter.packageType) query.packageType = filter.packageType;
    if (filter.status) query.status = filter.status;
    if (filter.search) {
      query.$or = [
        { fullName: { $regex: filter.search, $options: 'i' } },
        { email: { $regex: filter.search, $options: 'i' } },
        { message: { $regex: filter.search, $options: 'i' } },
      ];
    }

    const skip = (filter.page - 1) * filter.limit;
    const [items, total] = await Promise.all([
      this.inquiryModel
        .find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(filter.limit)
        .lean()
        .exec(),
      this.inquiryModel.countDocuments(query).exec(),
    ]);

    return { items, total };
  }

  findById(id: string) {
    return this.inquiryModel.findById(id).lean().exec();
  }

  updateResolution(
    id: string,
    status: PackageInquiryStatus,
    resolutionNote?: string,
    resolvedByUserId?: string,
  ) {
    return this.inquiryModel
      .findByIdAndUpdate(
        id,
        {
          $set: {
            status,
            ...(resolutionNote !== undefined ? { resolutionNote } : {}),
            resolvedAt: new Date(),
            ...(resolvedByUserId ? { resolvedByUserId } : {}),
          },
        },
        { new: true },
      )
      .lean()
      .exec();
  }
}