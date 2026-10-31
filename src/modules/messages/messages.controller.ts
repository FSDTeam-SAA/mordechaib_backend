import {
  BadGatewayException,
  Body,
  Controller,
  Delete,
  Get,
  Logger,
  Param,
  Post,
  Query,
  Req,
  Res,
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
  ApiProduces,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Request, Response } from 'express';
import { once } from 'node:events';
import { CurrentOrg } from '../../common/decorators/current-org.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RawResponse } from '../../common/decorators/raw-response.decorator';
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
import { validateAiChatUploads } from './ai-chat-upload.policy';
import {
  AiChatStreamingService,
  OpenedAiChatStream,
} from '../ai-integration/ai-chat-streaming.service';

@ApiTags('Messages')
@ApiBearerAuth()
@Controller('messages')
@UseGuards(OrganizationGuard, RolesGuard)
export class MessagesController {
  private readonly logger = new Logger(MessagesController.name);

  constructor(
    private readonly messages: MessagesService,
    private readonly chatStreaming: AiChatStreamingService,
  ) {}

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
  @RawResponse()
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
      required: ['startNewConversation'],
      properties: {
        startNewConversation: {
          type: 'boolean',
          description:
            'True creates a new conversation for this first message; false requires conversationId.',
        },
        clientMessageId: { type: 'string', format: 'uuid' },
        conversationId: { type: 'string' },
        content: { type: 'string', maxLength: 20_000 },
        selectedAgentId: { type: 'string', format: 'object-id' },
        files: {
          type: 'array',
          maxItems: MAX_MESSAGE_ATTACHMENTS,
          description:
            'For streamed AI analysis: up to 5 PDF/DOCX/PNG/JPEG/WEBP/GIF files and 20 MB combined.',
          items: { type: 'string', format: 'binary' },
        },
      },
    },
  })
  @ApiOperation({ summary: 'Send text and/or private file attachments' })
  @ApiProduces('application/json', 'text/event-stream')
  @ApiResponse({
    status: 200,
    description:
      'SSE message stream when Accept is text/event-stream. The terminal result is emitted only after persistence.',
  })
  @ApiResponse({
    status: 201,
    description: 'Existing JSON message acknowledgement for polling clients.',
  })
  async create(
    @CurrentOrg() organization: RequestOrganization,
    @CurrentUser() user: RequestUser,
    @Body() input: CreateMessageDto,
    @UploadedFiles() files: Express.Multer.File[] | undefined,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<void> {
    const streaming = this.acceptsEventStream(request);
    const aiAttachments = streaming ? validateAiChatUploads(files) : [];
    const message = await this.messages.create(
      organization.id,
      user.id,
      input,
      files,
      { enqueueAi: !streaming },
    );
    if (!streaming) {
      response.status(201).json({ success: true, data: message });
      return;
    }
    await this.streamMessage(
      organization.id,
      String(message.id),
      message,
      request,
      response,
      aiAttachments,
    );
  }

  private async streamMessage(
    organizationId: string,
    messageId: string,
    message: Record<string, unknown>,
    request: Request,
    response: Response,
    attachments: Parameters<AiChatStreamingService['open']>[3],
  ) {
    const clientController = new AbortController();
    let opened: OpenedAiChatStream | undefined;
    const abortUpstream = () => {
      if (response.writableEnded) return;
      clientController.abort();
      opened?.abort();
    };
    request.once('aborted', abortUpstream);
    response.once('close', abortUpstream);

    try {
      opened = await this.chatStreaming.open(
        organizationId,
        messageId,
        clientController.signal,
        attachments,
      );
      if (!opened.response.ok) {
        await this.chatStreaming.reject(opened, opened.response.status);
        await this.forwardPreStreamResponse(
          opened.response,
          response,
          clientController.signal,
        );
        return;
      }
      const contentType = opened.response.headers.get('content-type') || '';
      if (!contentType.toLowerCase().startsWith('text/event-stream')) {
        await this.chatStreaming.reject(opened, 502);
        throw new BadGatewayException(
          'AI service returned a non-streaming chat response',
        );
      }

      response.status(200);
      response.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
      response.setHeader('Cache-Control', 'no-cache, no-transform');
      response.setHeader('Connection', 'keep-alive');
      response.setHeader('X-Accel-Buffering', 'no');
      response.flushHeaders();
      await this.write(
        response,
        this.sse('message_created', {
          ...message,
          processingStatus: 'PROCESSING',
        }),
        clientController.signal,
      );
      await this.chatStreaming.consume(opened, (rawEvent) =>
        this.write(response, rawEvent, clientController.signal),
      );
      if (!response.writableEnded) response.end();
    } catch (error) {
      if (clientController.signal.aborted || response.destroyed) return;
      if (response.headersSent) {
        this.logger.error(
          `AI message stream interrupted: message=${messageId}, reason=${error instanceof Error ? error.message : 'unknown error'}`,
        );
        response.write(
          this.sse('error', {
            status: 502,
            detail: 'The message stream was interrupted.',
          }),
        );
        response.end();
        return;
      }
      throw error;
    } finally {
      request.removeListener('aborted', abortUpstream);
      response.removeListener('close', abortUpstream);
      if (opened && !opened.settled) {
        const reason = clientController.signal.aborted
          ? 'Client disconnected before the AI chat stream completed'
          : 'Main Backend ended the AI chat stream before a terminal event';
        await this.chatStreaming.cancel(opened, reason).catch((error) => {
          this.logger.error(
            `Unable to finalize interrupted AI message stream: message=${messageId}, reason=${error instanceof Error ? error.message : 'unknown error'}`,
          );
        });
      } else {
        opened?.abort();
      }
    }
  }

  private acceptsEventStream(request: Request) {
    return (request.headers.accept || '')
      .split(',')
      .map((value) => value.split(';')[0].trim().toLowerCase())
      .includes('text/event-stream');
  }

  private async forwardPreStreamResponse(
    upstream: globalThis.Response,
    response: Response,
    signal: AbortSignal,
  ) {
    response.status(upstream.status);
    response.setHeader(
      'Content-Type',
      upstream.headers.get('content-type') || 'application/json; charset=utf-8',
    );
    response.setHeader('Cache-Control', 'no-store');
    if (upstream.body) {
      const reader = upstream.body.getReader();
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          await this.write(response, Buffer.from(value), signal);
        }
      } finally {
        reader.releaseLock();
      }
    }
    if (!response.writableEnded) response.end();
  }

  private async write(
    response: Response,
    value: string | Buffer,
    signal: AbortSignal,
  ) {
    if (!response.write(value)) {
      await once(response, 'drain', { signal });
    }
  }

  private sse(event: string, data: unknown) {
    return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
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
