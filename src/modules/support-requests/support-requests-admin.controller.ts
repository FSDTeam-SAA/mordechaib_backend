import {
  Body,
  Controller,
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
import { ListSupportRequestsAdminQueryDto } from './dto/list-support-requests-admin-query.dto';
import { SupportAttachmentDownloadQueryDto } from './dto/support-attachment-download-query.dto';
import { UpdateSupportRequestStatusDto } from './dto/update-support-request-status.dto';
import { SupportRequestsService } from './support-requests.service';

@ApiTags('Help & Support (admin)')
@ApiBearerAuth()
@Controller('support/admin/requests')
@UseGuards(PlatformAdminGuard)
export class SupportRequestsAdminController {
  constructor(private readonly support: SupportRequestsService) {}

  @Get()
  @ApiOperation({ summary: 'List support requests across organizations' })
  list(@Query() query: ListSupportRequestsAdminQueryDto) {
    return this.support.listForAdmin(query);
  }

  @Get(':requestId/attachments/:attachmentId/download')
  @ApiOperation({ summary: 'Get a support attachment URL' })
  attachment(
    @Param('requestId') requestId: string,
    @Param('attachmentId') attachmentId: string,
    @Query() query: SupportAttachmentDownloadQueryDto,
  ) {
    return this.support.getAttachmentForAdmin(
      requestId,
      attachmentId,
      query.disposition,
    );
  }

  @Get(':requestId')
  @ApiOperation({ summary: 'Get support request details for support staff' })
  get(@Param('requestId') requestId: string) {
    return this.support.getForAdmin(requestId);
  }

  @Patch(':requestId/status')
  @ApiOperation({ summary: 'Update the support request lifecycle status' })
  updateStatus(
    @Param('requestId') requestId: string,
    @Body() input: UpdateSupportRequestStatusDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.support.updateStatus(requestId, input, user.id);
  }
}
