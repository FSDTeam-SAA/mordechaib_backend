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
import { CreateConversationDto } from './dto/create-conversation.dto';
import { CreateMessageDto } from './dto/create-message.dto';
import { ListConversationsQueryDto } from './dto/list-conversations-query.dto';
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
  @ApiOperation({ summary: "Get the user's latest AI conversation" })
  getConversation(
    @CurrentOrg() organization: RequestOrganization,
    @CurrentUser() user: RequestUser,
  ) {
    return this.messages.getConversation(organization.id, user.id);
  }

  @Post('conversations')
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.MEMBER)
  @ApiOperation({ summary: 'Start a new AI conversation' })
  createConversation(
    @CurrentOrg() organization: RequestOrganization,
    @CurrentUser() user: RequestUser,
    @Body() input: CreateConversationDto,
  ) {
    return this.messages.createConversation(organization.id, user.id, input);
  }

  @Get('conversations')
  @ApiOperation({ summary: "List the user's AI conversations" })
  listConversations(
    @CurrentOrg() organization: RequestOrganization,
    @CurrentUser() user: RequestUser,
    @Query() query: ListConversationsQueryDto,
  ) {
    return this.messages.listConversations(organization.id, user.id, query);
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
        conversationId: { type: 'string' },
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
  @ApiOperation({
    summary: "List messages in the user's selected conversation",
  })
  list(
    @CurrentOrg() organization: RequestOrganization,
    @CurrentUser() user: RequestUser,
    @Query() query: ListMessagesQueryDto,
  ) {
    return this.messages.list(organization.id, user.id, query);
  }

  @Get(':messageId/attachments/:attachmentId/download')
  @ApiOperation({ summary: 'Get an authorized short-lived attachment URL' })
  getAttachmentDownload(
    @CurrentOrg() organization: RequestOrganization,
    @CurrentUser() user: RequestUser,
    @Param('messageId') messageId: string,
    @Param('attachmentId') attachmentId: string,
    @Query() query: AttachmentDownloadQueryDto,
  ) {
    return this.messages.getAttachmentDownload(
      organization.id,
      user,
      messageId,
      attachmentId,
      query.disposition,
    );
  }

  @Get(':messageId')
  @ApiOperation({ summary: 'Get one message and its attachments' })
  get(
    @CurrentOrg() organization: RequestOrganization,
    @CurrentUser() user: RequestUser,
    @Param('messageId') messageId: string,
  ) {
    return this.messages.get(organization.id, user, messageId);
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
