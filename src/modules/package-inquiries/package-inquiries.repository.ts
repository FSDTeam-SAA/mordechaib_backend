import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { PackageInquiry } from '../../database/schemas/package-inquiry.schema';
import { PackageType } from '../../common/enums/package-type.enum';
import { CreatePackageInquiryDto } from './dto/create-package-inquiry.dto';

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
    },
  ) {
    return this.inquiryModel.create({
      packageType: input.packageType,
      organizationId: input.organizationId,
      fullName: input.fullName.trim(),
      email: input.email,
      message: input.message.trim(),
      consentAcceptedAt: new Date(),
    });
  }
}