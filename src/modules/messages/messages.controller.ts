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
import { AttachmentDownloadQueryDto } from './dto/attachment-download-query.dto';
import { CreateMessageDto } from './dto/create-message.dto';
import { ListMessagesQueryDto } from './dto/list-messages-query.dto';
import {
  MAX_MESSAGE_ATTACHMENTS,
  MESSAGE_UPLOAD_OPTIONS,
} from './message-upload.config';
import { MessagesService } from './messages.service';
import { TemporaryUploadCleanupInterceptor } from './temporary-upload-cleanup.interceptor';

@ApiTags('Messages')
@ApiBearerAuth()
@Controller('messages')
@UseGuards(OrganizationGuard, RolesGuard)
export class MessagesController {
  constructor(private readonly messages: MessagesService) {}

  @Get('conversation')
  @ApiOperation({ summary: "Get the organization's single AI conversation" })
  getConversation(@CurrentOrg() organization: RequestOrganization) {
    return this.messages.getConversation(organization.id);
  }

  @Post()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.MEMBER)
  @UseInterceptors(
    TemporaryUploadCleanupInterceptor,
    FilesInterceptor('files', MAX_MESSAGE_ATTACHMENTS, MESSAGE_UPLOAD_OPTIONS),
  )
  @ApiConsumes('multipart/form-data', 'application/json')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        clientMessageId: { type: 'string', format: 'uuid' },
        content: { type: 'string', maxLength: 20_000 },
        files: {
          type: 'array',
          maxItems: MAX_MESSAGE_ATTACHMENTS,
          items: { type: 'string', format: 'binary' },
        },
      },
    },
  })
  @ApiOperation({ summary: 'Send text and/or private file attachments' })
  create(
    @CurrentOrg() organization: RequestOrganization,
    @CurrentUser() user: RequestUser,
    @Body() input: CreateMessageDto,
    @UploadedFiles() files: Express.Multer.File[] | undefined,
  ) {
    return this.messages.create(organization.id, user.id, input, files);
  }

  @Get()
  @ApiOperation({ summary: 'List messages in the organization conversation' })
  list(
    @CurrentOrg() organization: RequestOrganization,
    @Query() query: ListMessagesQueryDto,
  ) {
    return this.messages.list(organization.id, query);
  }

  @Get(':messageId/attachments/:attachmentId/download')
  @ApiOperation({ summary: 'Get an authorized short-lived attachment URL' })
  getAttachmentDownload(
    @CurrentOrg() organization: RequestOrganization,
    @Param('messageId') messageId: string,
    @Param('attachmentId') attachmentId: string,
    @Query() query: AttachmentDownloadQueryDto,
  ) {
    return this.messages.getAttachmentDownload(
      organization.id,
      messageId,
      attachmentId,
      query.disposition,
    );
  }

  @Get(':messageId')
  @ApiOperation({ summary: 'Get one message and its attachments' })
  get(
    @CurrentOrg() organization: RequestOrganization,
    @Param('messageId') messageId: string,
  ) {
    return this.messages.get(organization.id, messageId);
  }

  @Delete(':messageId')
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.MEMBER)
  @ApiOperation({ summary: 'Soft-delete a message and clean up its files' })
  remove(
    @CurrentOrg() organization: RequestOrganization,
    @CurrentUser() user: RequestUser,
    @Param('messageId') messageId: string,
  ) {
    return this.messages.delete(organization.id, user, messageId);
  }
}
