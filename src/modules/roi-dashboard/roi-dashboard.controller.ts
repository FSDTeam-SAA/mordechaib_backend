import {
  Body,
  Controller,
  Get,
  Patch,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiProduces,
  ApiTags,
} from '@nestjs/swagger';
import { Response } from 'express';
import { CurrentOrg } from '../../common/decorators/current-org.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RawResponse } from '../../common/decorators/raw-response.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/enums/user-role.enum';
import { localDateKey } from '../../common/helpers/local-date-range.helper';
import { OrganizationGuard } from '../../common/guards/organization.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import {
  RequestOrganization,
  RequestUser,
} from '../../common/types/request-context.type';
import { GetRoiDashboardQueryDto } from './dto/get-roi-dashboard-query.dto';
import { UpdateRoiConfigurationDto } from './dto/update-roi-configuration.dto';
import { RoiDashboardService } from './roi-dashboard.service';
import { RoiReportService } from './roi-report.service';
import { RoiSettingsService } from './roi-settings.service';

@ApiTags('ROI Dashboard')
@ApiBearerAuth()
@Controller('roi-dashboard')
@UseGuards(OrganizationGuard, RolesGuard)
@Roles(UserRole.OWNER, UserRole.ADMIN)
export class RoiDashboardController {
  constructor(
    private readonly dashboard: RoiDashboardService,
    private readonly settings: RoiSettingsService,
    private readonly reports: RoiReportService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Get measured automation and estimated ROI data' })
  getDashboard(
    @CurrentOrg() organization: RequestOrganization,
    @Query() query: GetRoiDashboardQueryDto,
  ) {
    return this.dashboard.dashboard(organization.id, query);
  }

  @Get('settings')
  @ApiOperation({ summary: 'Get effective organization ROI methodology' })
  getSettings(@CurrentOrg() organization: RequestOrganization) {
    return this.settings.get(organization.id);
  }

  @Patch('settings')
  @ApiOperation({ summary: 'Override organization ROI methodology' })
  updateSettings(
    @CurrentOrg() organization: RequestOrganization,
    @CurrentUser() user: RequestUser,
    @Body() input: UpdateRoiConfigurationDto,
  ) {
    return this.settings.update(organization.id, user.id, input);
  }

  @Get('report')
  @RawResponse()
  @ApiProduces('application/pdf')
  @ApiOperation({ summary: 'Download an on-demand ROI report as PDF' })
  async report(
    @CurrentOrg() organization: RequestOrganization,
    @Query() query: GetRoiDashboardQueryDto,
    @Res() response: Response,
  ) {
    const snapshot = await this.dashboard.dashboard(organization.id, query);
    const report = await this.reports.create(snapshot);
    const date = localDateKey(new Date(snapshot.asOf), snapshot.timezone);
    response.status(200);
    response.setHeader('Content-Type', 'application/pdf');
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="noltra-roi-report-${date}.pdf"`,
    );
    response.setHeader('Content-Length', String(report.length));
    response.setHeader('Cache-Control', 'private, no-store');
    response.end(report);
  }
}
