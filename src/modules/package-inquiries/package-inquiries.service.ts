import { Injectable } from '@nestjs/common';
import { PackageType } from '../../common/enums/package-type.enum';
import { CreatePackageInquiryDto } from './dto/create-package-inquiry.dto';
import { PackageInquiriesRepository } from './package-inquiries.repository';

@Injectable()
export class PackageInquiriesService {
  constructor(private readonly repository: PackageInquiriesRepository) {}

  create(
    input: CreatePackageInquiryDto & {
      packageType?: PackageType;
      organizationId?: string;
    },
  ) {
    return this.repository.create(input);
  }
}