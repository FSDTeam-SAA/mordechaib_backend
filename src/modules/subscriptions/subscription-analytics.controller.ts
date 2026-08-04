import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PlatformAdminGuard } from '../../common/guards/platform-admin.guard';
import { RevenueOverviewQueryDto } from './dto/revenue-overview-query.dto';
import { SubscriptionAnalyticsService } from './subscription-analytics.service';

@ApiTags('Subscription analytics')
@ApiBearerAuth()
@Controller('subscription-analytics')
@UseGuards(PlatformAdminGuard)
export class SubscriptionAnalyticsController {
  constructor(private readonly service: SubscriptionAnalyticsService) {}

  // 4 overview cards: Active Subscriptions, MRR, ARR, Renewals This Month.
  @Get('overview-cards')
  getOverviewCards() {
    return this.service.getOverviewCards();
  }

  // Revenue Overview chart — monthly series for the current year to date.
  @Get('revenue-overview')
  getRevenueOverview(@Query() query: RevenueOverviewQueryDto) {
    return this.service.getRevenueOverview(query.range!);
  }

  // Plan Distribution donut.
  @Get('plan-distribution')
  getPlanDistribution() {
    return this.service.getPlanDistribution();
  }
}