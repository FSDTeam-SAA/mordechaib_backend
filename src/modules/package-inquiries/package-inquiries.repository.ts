import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { PackageInquiry } from '../../database/schemas/package-inquiry.schema';
import { CreatePackageInquiryDto } from './dto/create-package-inquiry.dto';

@Injectable()
export class PackageInquiriesRepository {
  constructor(
    @InjectModel(PackageInquiry.name)
    private readonly inquiryModel: Model<PackageInquiry>,
  ) {}

  create(input: CreatePackageInquiryDto) {
    return this.inquiryModel.create({
      fullName: input.fullName.trim(),
      email: input.email,
      message: input.message.trim(),
      consentAcceptedAt: new Date(),
    });
  }
}
