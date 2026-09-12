import { createReadStream } from 'fs';
import { Controller, Get, Param, Query, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { CurrentOrg } from '../../common/decorators/current-org.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/enums/user-role.enum';
import { OrganizationGuard } from '../../common/guards/organization.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { RequestOrganization } from '../../common/types/request-context.type';
import { CallIntelligenceService } from './call-intelligence.service';
import {
  DownloadCallAudioQueryDto,
  DownloadCallIntelligenceReportQueryDto,
  GetCallIntelligenceQueryDto,
} from './dto/get-call-intelligence-query.dto';

@ApiTags('Call Intelligence')
@ApiBearerAuth()
@Controller('call-intelligence')
@UseGuards(OrganizationGuard, RolesGuard)
@Roles(UserRole.OWNER, UserRole.ADMIN)
export class CallIntelligenceController {
  constructor(private readonly intelligence: CallIntelligenceService) {}

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
