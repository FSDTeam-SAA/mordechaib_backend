import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PlatformAdminGuard } from '../../common/guards/platform-admin.guard';
import { RequestUser } from '../../common/types/request-context.type';
import { ContactEnquiriesService } from './contact-enquiries.service';
import { DeleteContactEnquiryQueryDto } from './dto/delete-contact-enquiry-query.dto';
import { ListContactEnquiriesQueryDto } from './dto/list-contact-enquiries-query.dto';
import { UpdateContactEnquiryDto } from './dto/update-contact-enquiry.dto';

@ApiTags('Contact Support (admin)')
@ApiBearerAuth()
@Controller('contact-support/admin/enquiries')
@UseGuards(PlatformAdminGuard)
export class ContactEnquiriesAdminController {
  constructor(private readonly enquiries: ContactEnquiriesService) {}

  @Get()
  @ApiOperation({ summary: 'List public contact-support enquiries' })
  list(@Query() query: ListContactEnquiriesQueryDto) {
    return this.enquiries.list(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one public contact-support enquiry' })
  get(@Param('id') id: string) {
    return this.enquiries.get(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update enquiry details, status, or internal note' })
  update(
    @Param('id') id: string,
    @Body() input: UpdateContactEnquiryDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.enquiries.update(id, input, {
      id: user.id,
      organizationId: user.organizationId,
    });
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Soft-delete one public contact-support enquiry' })
  remove(
    @Param('id') id: string,
    @Query() query: DeleteContactEnquiryQueryDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.enquiries.remove(id, query.expectedRevision, {
      id: user.id,
      organizationId: user.organizationId,
    });
  }
}
