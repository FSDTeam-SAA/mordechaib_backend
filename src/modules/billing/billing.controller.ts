import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentOrg } from '../../common/decorators/current-org.decorator';
import { OrganizationGuard } from '../../common/guards/organization.guard';
import { RequestOrganization } from '../../common/types/request-context.type';
import { BillingService } from './billing.service';
import { CreateCheckoutSessionDto } from './dto/create-checkout-session.dto';
import { PauseSubscriptionDto } from './dto/pause-subscription.dto';
import { UpgradeSubscriptionDto } from './dto/upgrade-subscription.dto';

@ApiTags('Billing')
@ApiBearerAuth()
@Controller('billing')
@UseGuards(OrganizationGuard)
export class BillingController {
  constructor(private readonly service: BillingService) {}

  // First-time checkout. Cancellation lives at POST /subscriptions/me/cancel
  // (it needs the reason/password flow, not just a Stripe call) — see
  // SubscriptionsController.
  @Post('checkout-session')
  createCheckoutSession(
    @CurrentOrg() organization: RequestOrganization,
    @Body() dto: CreateCheckoutSessionDto,
  ) {
    return this.service.createCheckoutSession(organization.id, dto);
  }

  @Post('upgrade')
  upgradeSubscription(
    @CurrentOrg() organization: RequestOrganization,
    @Body() dto: UpgradeSubscriptionDto,
  ) {
    return this.service.upgradeSubscription(organization.id, dto.planType);
  }

  @Post('pause')
  pauseSubscription(
    @CurrentOrg() organization: RequestOrganization,
    @Body() dto: PauseSubscriptionDto,
  ) {
    return this.service.pauseSubscription(organization.id, dto.days);
  }

  @Post('resume')
  resumeSubscription(@CurrentOrg() organization: RequestOrganization) {
    return this.service.resumeSubscription(organization.id);
  }
}