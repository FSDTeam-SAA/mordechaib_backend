import { Injectable } from '@nestjs/common';
import { CreatePackageInquiryDto } from './dto/create-package-inquiry.dto';
import { PackageInquiriesRepository } from './package-inquiries.repository';

@Injectable()
export class PackageInquiriesService {
  constructor(private readonly repository: PackageInquiriesRepository) {}

  create(input: CreatePackageInquiryDto) {
    return this.repository.create(input);
  }
}
