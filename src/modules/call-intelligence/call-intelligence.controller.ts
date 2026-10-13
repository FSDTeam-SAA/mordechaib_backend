import { createReadStream } from 'fs';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';
import {
  BadGatewayException,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
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
    summary: 'Get an aggregated call, meeting, or user-message intelligence view',
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
  @ApiProduces('audio/wav', 'audio/mpeg', 'audio/mp4', 'audio/ogg', 'audio/webm')
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
    if ('downloadUrl' in audio) {
      let upstream: globalThis.Response;
      try {
        upstream = await fetch(audio.downloadUrl, {
          headers: rangeHeader ? { Range: rangeHeader } : undefined,
        });
      } catch {
        throw new BadGatewayException('Call audio storage is unavailable');
      }
      if (upstream.status === 416) {
        response.status(416);
        const contentRange = upstream.headers.get('content-range');
        if (contentRange) response.setHeader('Content-Range', contentRange);
        response.end();
        return;
      }
      if (!upstream.ok || !upstream.body) {
        throw new BadGatewayException('Call audio could not be downloaded');
      }
      this.setAudioHeaders(
        response,
        upstream.headers.get('content-type') || audio.contentType,
        audio.filename,
        upstream.headers.get('content-length'),
      );
      response.setHeader('Accept-Ranges', 'bytes');
      const contentRange = upstream.headers.get('content-range');
      if (contentRange) response.setHeader('Content-Range', contentRange);
      response.status(upstream.status === 206 ? 206 : 200);
      await pipeline(Readable.fromWeb(upstream.body as never), response);
      return;
    }

    const range = this.resolveByteRange(rangeHeader, audio.size);
    if (range === 'INVALID') {
      response.status(416);
      response.setHeader('Content-Range', `bytes */${audio.size}`);
      response.setHeader('Accept-Ranges', 'bytes');
      response.end();
      return;
    }
    const contentLength = range
      ? range.end - range.start + 1
      : audio.size;
    this.setAudioHeaders(
      response,
      audio.contentType,
      audio.filename,
      contentLength.toString(),
    );
    response.setHeader('Accept-Ranges', 'bytes');
    if (range) {
      response.status(206);
      response.setHeader(
        'Content-Range',
        `bytes ${range.start}-${range.end}/${audio.size}`,
      );
    }
    await pipeline(
      createReadStream(audio.filePath, range || undefined),
      response,
    );
  }

  private resolveByteRange(
    value: string | undefined,
    size: number,
  ): { start: number; end: number } | 'INVALID' | undefined {
    if (!value) return undefined;
    const match = /^bytes=(\d*)-(\d*)$/.exec(value.trim());
    if (!match || (!match[1] && !match[2])) return 'INVALID';

    if (!match[1]) {
      const suffixLength = Number(match[2]);
      if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0) {
        return 'INVALID';
      }
      return {
        start: Math.max(0, size - suffixLength),
        end: size - 1,
      };
    }

    const start = Number(match[1]);
    const requestedEnd = match[2] ? Number(match[2]) : size - 1;
    if (
      !Number.isSafeInteger(start) ||
      !Number.isSafeInteger(requestedEnd) ||
      start < 0 ||
      start >= size ||
      requestedEnd < start
    ) {
      return 'INVALID';
    }
    return { start, end: Math.min(requestedEnd, size - 1) };
  }

  private setAudioHeaders(
    response: Response,
    contentType: string,
    filename: string,
    contentLength: string | null,
  ) {
    response.setHeader('Content-Type', contentType);
    if (contentLength) response.setHeader('Content-Length', contentLength);
    response.setHeader(
      'Content-Disposition',
      `inline; filename="${filename.replace(/[^a-zA-Z0-9._-]/g, '_')}"`,
    );
  }
}
