import { Body, Controller, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../../common/decorators/public.decorator';
import { ContactEnquiriesService } from './contact-enquiries.service';
import { CreateContactEnquiryDto } from './dto/create-contact-enquiry.dto';

@ApiTags('Contact Support')
@Controller('contact-support')
export class ContactEnquiriesController {
  constructor(private readonly enquiries: ContactEnquiriesService) {}

  @Public()
  @Post()
  @Throttle({ default: { limit: 5, ttl: 60 * 60_000 } })
  @ApiOperation({
    summary: 'Submit a public contact-support enquiry',
    description:
      'Landing-page visitors use this endpoint to contact the Noltra platform team. It does not schedule a meeting.',
  })
  create(@Body() input: CreateContactEnquiryDto) {
    return this.enquiries.create(input);
  }
}
