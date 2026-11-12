import {
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiProduces,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Response } from 'express';
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
import { CallIntelligenceDeletionService } from './call-intelligence-deletion.service';
import { CallIntelligenceService } from './call-intelligence.service';
import { CallAudioPlaybackTokenService } from './call-audio-playback-token.service';
import { CallAudioStreamingService } from './call-audio-streaming.service';
import {
  DownloadCallAudioQueryDto,
  DownloadCallIntelligenceReportQueryDto,
  GetCallIntelligenceQueryDto,
} from './dto/get-call-intelligence-query.dto';
import { DeleteCallIntelligenceQueryDto } from './dto/delete-call-intelligence-query.dto';
import { ListCallIntelligenceQueryDto } from './dto/list-call-intelligence-query.dto';

@ApiTags('Call Intelligence')
@ApiBearerAuth()
@Controller('call-intelligence')
@UseGuards(OrganizationGuard, RolesGuard)
@Roles(UserRole.OWNER, UserRole.ADMIN)
export class CallIntelligenceController {
  constructor(
    private readonly intelligence: CallIntelligenceService,
    private readonly deletion: CallIntelligenceDeletionService,
    private readonly playbackTokens: CallAudioPlaybackTokenService,
    private readonly audioStreaming: CallAudioStreamingService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'List all call and meeting intelligence sources',
    description:
      'Returns a lightweight organization-scoped, newest-first list for the Call Intelligence table. Each row includes display metadata, media availability, a bulk-computed actionSummary, and the unchanged details path. Full transcript, analysis, evidence, and proposal payloads remain exclusive to the details endpoint.',
  })
  list(
    @CurrentOrg() organization: RequestOrganization,
    @Query() query: ListCallIntelligenceQueryDto,
  ) {
    return this.intelligence.list(organization.id, query);
  }

  @Get(':sourceId/details')
  @ApiOperation({
    summary:
      'Get an aggregated call, meeting, or user-message intelligence view',
    description:
      'For call and meeting sources, transcript content is omitted by default for a fast first paint; set includeTranscript=true to include it. USER_MESSAGE returns the source message in the message field. Action proposals across every status are returned when status is omitted, allowing the frontend to filter one response.',
  })
  getDetails(
    @CurrentOrg() organization: RequestOrganization,
    @Param('sourceId') sourceId: string,
    @Query() query: GetCallIntelligenceQueryDto,
  ) {
    return this.intelligence.getDetails(organization.id, sourceId, query);
  }

  @Delete(':sourceId/details')
  @ApiOperation({
    summary: 'Delete a completed call or meeting intelligence source',
    description:
      'Deletes the source media record, transcript, analysis, and proposals. Existing Tasks and provider Meetings created from approved proposals are retained and unlinked. Active or processing sources cannot be deleted.',
  })
  deleteDetails(
    @CurrentOrg() organization: RequestOrganization,
    @CurrentUser() user: RequestUser,
    @Param('sourceId') sourceId: string,
    @Query() query: DeleteCallIntelligenceQueryDto,
  ) {
    return this.deletion.delete(
      organization.id,
      user.id,
      sourceId,
      query.sourceType,
    );
  }

  @Get(':sourceId/report')
  @ApiOperation({ summary: 'Download a source intelligence report' })
  async downloadReport(
    @CurrentOrg() organization: RequestOrganization,
    @Param('sourceId') sourceId: string,
    @Query() query: DownloadCallIntelligenceReportQueryDto,
    @Res() response: Response,
  ) {
    const details = await this.intelligence.getDetails(
      organization.id,
      sourceId,
      query,
    );
    const report = this.intelligence.createReport(details, query.format);
    response.setHeader('Content-Type', report.contentType);
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="call-intelligence-${sourceId}.${report.extension}"`,
    );
    response.setHeader('Content-Length', report.content.byteLength.toString());
    response.end(report.content);
  }

  @Get(':sourceId/audio')
  @ApiOperation({
    summary: 'Stream an authorized Twilio call recording',
    description:
      'Returns the audio bytes through the authenticated backend for both local and Cloudinary-backed recordings.',
  })
  @ApiProduces(
    'audio/wav',
    'audio/mpeg',
    'audio/mp4',
    'audio/ogg',
    'audio/webm',
  )
  @ApiOkResponse({
    description: 'Complete audio stream',
    schema: { type: 'string', format: 'binary' },
  })
  @ApiResponse({
    status: 206,
    description: 'Partial audio stream for a byte-range request',
    schema: { type: 'string', format: 'binary' },
  })
  async downloadCallAudio(
    @CurrentOrg() organization: RequestOrganization,
    @Param('sourceId') sourceId: string,
    @Query() query: DownloadCallAudioQueryDto,
    @Headers('range') rangeHeader: string | undefined,
    @Res() response: Response,
  ) {
    const audio = await this.intelligence.getCallAudio(
      organization.id,
      sourceId,
      query.sourceType,
    );
    await this.audioStreaming.stream(audio, rangeHeader, response);
  }

  @Post(':sourceId/audio/playback')
  @ApiOperation({
    summary: 'Create a short-lived call audio playback URL',
    description:
      'Returns a signed URL that an HTML audio element can use without exposing the user access token. The URL remains organization/source scoped and supports byte-range playback.',
  })
  async createAudioPlayback(
    @CurrentOrg() organization: RequestOrganization,
    @Param('sourceId') sourceId: string,
    @Query() query: DownloadCallAudioQueryDto,
  ) {
    // Resolve first so a capability is never issued for a missing or
    // unauthorized recording.
    await this.intelligence.getCallAudio(
      organization.id,
      sourceId,
      query.sourceType,
    );
    const issued = this.playbackTokens.issue({
      organizationId: organization.id,
      sourceId,
      sourceType: query.sourceType,
    });
    return {
      playbackPath: `/api/v1/call-intelligence/audio/playback/${issued.token}`,
      expiresAt: issued.expiresAt,
    };
  }
}
