import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentOrg } from '../../common/decorators/current-org.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/enums/user-role.enum';
import { OrganizationGuard } from '../../common/guards/organization.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import {
  RequestOrganization,
  RequestUser,
} from '../../common/types/request-context.type';
import { TemporaryUploadCleanupInterceptor } from '../messages/temporary-upload-cleanup.interceptor';
import { CreateSupportRequestDto } from './dto/create-support-request.dto';
import { ListSupportRequestsQueryDto } from './dto/list-support-requests-query.dto';
import { SupportAttachmentDownloadQueryDto } from './dto/support-attachment-download-query.dto';
import {
  MAX_SUPPORT_ATTACHMENTS,
  SUPPORT_REQUEST_UPLOAD_OPTIONS,
} from './support-request-upload.config';
import { SupportRequestsService } from './support-requests.service';

@ApiTags('Help & Support')
@ApiBearerAuth()
@Controller('support/requests')
@UseGuards(OrganizationGuard, RolesGuard)
export class SupportRequestsController {
  constructor(private readonly support: SupportRequestsService) {}

  @Post()
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.MEMBER)
  @Throttle({ default: { limit: 10, ttl: 60 * 60_000 } })
  @UseInterceptors(
    TemporaryUploadCleanupInterceptor,
    FilesInterceptor(
      'attachments',
      MAX_SUPPORT_ATTACHMENTS,
      SUPPORT_REQUEST_UPLOAD_OPTIONS,
    ),
  )
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['category', 'subject', 'description'],
      properties: {
        category: {
          type: 'string',
          enum: [
            'ACCOUNT',
            'BILLING',
            'TECHNICAL',
            'INTEGRATION',
            'AI_ASSISTANT',
            'FEATURE_REQUEST',
            'OTHER',
          ],
        },
        subject: { type: 'string', minLength: 3, maxLength: 200 },
        description: { type: 'string', minLength: 10, maxLength: 20_000 },
        attachments: {
          type: 'array',
          maxItems: MAX_SUPPORT_ATTACHMENTS,
          items: { type: 'string', format: 'binary' },
          description: 'Optional PDF, JPG/JPEG, or PNG files; 10 MB each.',
        },
      },
    },
  })
  @ApiOperation({ summary: 'Submit a support request with private files' })
  create(
    @CurrentOrg() organization: RequestOrganization,
    @CurrentUser() user: RequestUser,
    @Body() input: CreateSupportRequestDto,
    @UploadedFiles() files: Express.Multer.File[] | undefined,
  ) {
    return this.support.create(organization.id, user.id, input, files);
  }

  @Get()
  @ApiOperation({ summary: "List the signed-in user's support requests" })
  list(
    @CurrentOrg() organization: RequestOrganization,
    @CurrentUser() user: RequestUser,
    @Query() query: ListSupportRequestsQueryDto,
  ) {
    return this.support.listForUser(organization.id, user.id, query);
  }

  @Get(':requestId/attachments/:attachmentId/download')
  @ApiOperation({ summary: 'Get a short-lived private attachment URL' })
  attachment(
    @CurrentOrg() organization: RequestOrganization,
    @CurrentUser() user: RequestUser,
    @Param('requestId') requestId: string,
    @Param('attachmentId') attachmentId: string,
    @Query() query: SupportAttachmentDownloadQueryDto,
  ) {
    return this.support.getAttachmentForUser(
      organization.id,
      user.id,
      requestId,
      attachmentId,
      query.disposition,
    );
  }

  @Get(':requestId')
  @ApiOperation({ summary: 'Get support request details' })
  get(
    @CurrentOrg() organization: RequestOrganization,
    @CurrentUser() user: RequestUser,
    @Param('requestId') requestId: string,
  ) {
    return this.support.getForUser(organization.id, user.id, requestId);
  }

  @Delete(':requestId')
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.MEMBER)
  @ApiOperation({ summary: 'Delete one of the signed-in user requests' })
  remove(
    @CurrentOrg() organization: RequestOrganization,
    @CurrentUser() user: RequestUser,
    @Param('requestId') requestId: string,
  ) {
    return this.support.remove(organization.id, user.id, requestId);
  }
}
