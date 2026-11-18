import { Controller, Get, Query, Res, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiProduces,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Response } from 'express';
import { AUDIT_ACTION } from '../../common/constants/audit-action.constants';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RawResponse } from '../../common/decorators/raw-response.decorator';
import { PlatformAdminGuard } from '../../common/guards/platform-admin.guard';
import { RequestUser } from '../../common/types/request-context.type';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { RevenueAnalyticsService } from './revenue-analytics.service';
import { RevenueAnalyticsMethodologyResponse } from './revenue-analytics.types';
import { RevenueAnalyticsRangeQueryDto } from './dto/revenue-analytics-range-query.dto';
import { RevenueRetentionService } from './revenue-retention.service';
import { RevenueRetentionResponse } from './revenue-retention.types';
import { RevenueUnitEconomicsQueryDto } from './dto/revenue-unit-economics-query.dto';
import { RevenueUnitEconomicsService } from './revenue-unit-economics.service';
import { RevenueUnitEconomicsResponse } from './revenue-unit-economics.types';
import { RevenueAnalyticsReportService } from './revenue-analytics-report.service';

@ApiTags('Revenue & Analytics (platform admin)')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Authentication is required.' })
@ApiForbiddenResponse({ description: 'Platform admin access is required.' })
@Controller('platform/revenue-analytics')
@UseGuards(PlatformAdminGuard)
export class RevenueAnalyticsController {
  constructor(
    private readonly analytics: RevenueAnalyticsService,
    private readonly retention: RevenueRetentionService,
    private readonly unitEconomics: RevenueUnitEconomicsService,
    private readonly reports: RevenueAnalyticsReportService,
    private readonly audits: AuditLogsService,
  ) {}

  @Get('methodology')
  @ApiOperation({
    summary: 'Get the Revenue & Analytics methodology contract',
    description:
      'Returns the stable USD-only formulas, source requirements, annual-revenue normalization, availability rules, and estimate disclosure policy shared by every Revenue & Analytics endpoint.',
  })
  @ApiOkResponse({ type: RevenueAnalyticsMethodologyResponse })
  methodology() {
    return this.analytics.methodology();
  }

  @Get('retention')
  @ApiOperation({
    summary: 'Get platform churn and retention analytics',
    description:
      'Returns opening-cohort churn, revenue retention, monthly trends, realized paid-invoice LTV by plan, cohort retention, and explicit source coverage. Missing historical snapshots remain unavailable rather than being represented as zero.',
  })
  @ApiOkResponse({ type: RevenueRetentionResponse })
  retentionAnalytics(@Query() query: RevenueAnalyticsRangeQueryDto) {
    return this.retention.getRetention(query);
  }

  @Get('unit-economics')
  @ApiOperation({
    summary: 'Get platform service costs and unit economics',
    description:
      'Returns paid revenue, AI/Twilio/Recall service costs, gross margin, cost per AI task, cost per active organization, blended CAC, realized LTV/CAC, payback, acquisition-cost breakdown, and monthly trends. Provider-reported AI cost is preferred; configured fallback costs are explicitly marked estimated. Missing cost coverage remains unavailable rather than becoming zero.',
  })
  @ApiOkResponse({ type: RevenueUnitEconomicsResponse })
  unitEconomicsAnalytics(@Query() query: RevenueUnitEconomicsQueryDto) {
    return this.unitEconomics.getUnitEconomics(query);
  }

  @Get('report')
  @RawResponse()
  @ApiProduces('application/pdf')
  @ApiOperation({
    summary: 'Download a combined Revenue & Analytics PDF report',
    description:
      'Renders the same authoritative retention and unit-economics results exposed by the JSON APIs. Unavailable values remain unavailable, estimated values are disclosed, and no subscription or billing record is modified.',
  })
  @ApiOkResponse({
    description: 'Revenue & Analytics report PDF.',
    schema: { type: 'string', format: 'binary' },
  })
  async report(
    @CurrentUser() user: RequestUser,
    @Query() query: RevenueUnitEconomicsQueryDto,
    @Res() response: Response,
  ) {
    const [retention, unitEconomics] = await Promise.all([
      this.retention.getRetention(query),
      this.unitEconomics.getUnitEconomics(query),
    ]);
    const report = await this.reports.create(retention, unitEconomics);

    await this.audits.create({
      organizationId: user.organizationId,
      userId: user.id,
      action: AUDIT_ACTION.REVENUE_ANALYTICS_REPORT_GENERATED,
      resourceType: 'REVENUE_ANALYTICS_REPORT',
      metadata: {
        format: 'PDF',
        from: retention.from,
        to: retention.to,
        timezone: retention.timezone,
        methodologyVersion: retention.methodologyVersion,
        hasEstimatedData: report.hasEstimatedData,
        generatedAt: report.generatedAt,
        sizeBytes: report.buffer.length,
      },
    });

    response.status(200);
    response.setHeader('Content-Type', 'application/pdf');
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="${report.filename}"`,
    );
    response.setHeader('Content-Length', String(report.buffer.length));
    response.setHeader('Cache-Control', 'private, no-store');
    response.end(report.buffer);
  }
}
