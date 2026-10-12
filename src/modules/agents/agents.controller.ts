import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PlatformAdminGuard } from '../../common/guards/platform-admin.guard';
import { RequestUser } from '../../common/types/request-context.type';
import { AgentStatus } from '../../common/enums/agent-status.enum';
import { AgentType } from '../../common/enums/agent-type.enum';
import { AgentsService } from './agents.service';
import { AGENT_IMAGE_UPLOAD_OPTIONS } from './agent-image-upload.config';
import { CreateAgentDto } from './dto/create-agent.dto';
import { ListAgentsQueryDto } from './dto/list-agents-query.dto';
import { UpdateAgentDto } from './dto/update-agent.dto';

@ApiTags('Agents')
@ApiBearerAuth()
@Controller('agents')
export class AgentsController {
  constructor(private readonly agents: AgentsService) {}

  @Post()
  @UseGuards(PlatformAdminGuard)
  @UseInterceptors(FileInterceptor('image', AGENT_IMAGE_UPLOAD_OPTIONS))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    required: true,
    schema: {
      type: 'object',
      required: ['name', 'type'],
      properties: {
        name: { type: 'string', minLength: 1, maxLength: 120 },
        type: { type: 'string', enum: Object.values(AgentType) },
        imageUrl: {
          type: 'string',
          format: 'uri',
          description: 'Existing image URL; do not combine with image.',
        },
        image: {
          type: 'string',
          format: 'binary',
          description:
            'JPEG, PNG, or WebP agent image; maximum 5 MB. Stored in Cloudinary.',
        },
      },
    },
  })
  @ApiOperation({ summary: 'Create an AI agent profile and upload its image' })
  create(
    @Body() dto: CreateAgentDto,
    @UploadedFile() image: Express.Multer.File | undefined,
  ) {
    return this.agents.create(dto, image);
  }

  @Get()
  @ApiOperation({ summary: 'List platform AI agent profiles' })
  list(@CurrentUser() actor: RequestUser, @Query() query: ListAgentsQueryDto) {
    if (!actor.isPlatformAdmin) {
      if (query.status && query.status !== AgentStatus.ACTIVE) {
        throw new ForbiddenException(
          'Only platform admins can view disabled agents',
        );
      }
      query.status = AgentStatus.ACTIVE;
    }
    return this.agents.list(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one platform AI agent profile' })
  get(@CurrentUser() actor: RequestUser, @Param('id') id: string) {
    return this.agents.get(id, actor.isPlatformAdmin);
  }

  @Patch(':id')
  @UseGuards(PlatformAdminGuard)
  @UseInterceptors(FileInterceptor('image', AGENT_IMAGE_UPLOAD_OPTIONS))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    required: true,
    schema: {
      type: 'object',
      properties: {
        name: { type: 'string', minLength: 1, maxLength: 120 },
        type: { type: 'string', enum: Object.values(AgentType) },
        status: { type: 'string', enum: Object.values(AgentStatus) },
        imageUrl: {
          type: 'string',
          format: 'uri',
          description: 'Existing URL-based update; do not combine with image.',
        },
        image: {
          type: 'string',
          format: 'binary',
          description:
            'JPEG, PNG, or WebP agent image; maximum 5 MB. Stored in Cloudinary.',
        },
      },
    },
  })
  @ApiOperation({
    summary: 'Update an AI agent profile and/or upload its image',
  })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateAgentDto,
    @UploadedFile() image: Express.Multer.File | undefined,
  ) {
    return this.agents.update(id, dto, image);
  }

  @Delete(':id')
  @UseGuards(PlatformAdminGuard)
  @ApiOperation({ summary: 'Disable a platform AI agent profile' })
  remove(@Param('id') id: string) {
    return this.agents.remove(id);
  }
}
