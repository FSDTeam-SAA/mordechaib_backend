import { createReadStream } from 'fs';
import {
  Controller,
  Delete,
  Get,
  Param,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
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
      'Returns one organization-scoped, newest-first list of Twilio call recordings, Google Meet sessions, and Zoom sessions. Each item contains the source type and id required by the details endpoint.',
  })
  list(
    @CurrentOrg() organization: RequestOrganization,
    @Query() query: ListCallIntelligenceQueryDto,
  ) {
    return this.intelligence.list(organization.id, query);
  }

  @Get(':sourceId/details')
  @ApiOperation({
    summary: 'Get an aggregated call or meeting intelligence view',
    description:
      'Transcript content is omitted by default for a fast first paint. Set includeTranscript=true to include it.',
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
  @ApiOperation({ summary: 'Stream an authorized Twilio call recording' })
  async downloadCallAudio(
    @CurrentOrg() organization: RequestOrganization,
    @Param('sourceId') sourceId: string,
    @Query() query: DownloadCallAudioQueryDto,
    @Res() response: Response,
  ) {
    const audio = await this.intelligence.getCallAudio(
      organization.id,
      sourceId,
      query.sourceType,
    );
    response.setHeader('Content-Type', audio.contentType);
    response.setHeader('Content-Length', audio.size.toString());
    response.setHeader(
      'Content-Disposition',
      `inline; filename="${audio.filename.replace(/[^a-zA-Z0-9._-]/g, '_')}"`,
    );
    createReadStream(audio.filePath).pipe(response);
  }
}
