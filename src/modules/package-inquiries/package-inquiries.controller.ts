import { Body, Controller, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../../common/decorators/public.decorator';
import { CreatePackageInquiryDto } from './dto/create-package-inquiry.dto';
import { PackageInquiriesService } from './package-inquiries.service';

@ApiTags('Package inquiries')
@Controller('package-inquiries')
export class PackageInquiriesController {
  constructor(private readonly service: PackageInquiriesService) {}

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60 * 60_000 } })
  @Post()
  create(@Body() dto: CreatePackageInquiryDto) {
    return this.service.create(dto);
  }
}
