import { Module } from '@nestjs/common';
import { PackageInquiriesController } from './package-inquiries.controller';
import { PackageInquiriesRepository } from './package-inquiries.repository';
import { PackageInquiriesService } from './package-inquiries.service';

@Module({
  controllers: [PackageInquiriesController],
  providers: [PackageInquiriesService, PackageInquiriesRepository],
})
export class PackageInquiriesModule {}
