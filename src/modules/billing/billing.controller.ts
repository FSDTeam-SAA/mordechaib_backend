import { Body, Controller, Delete, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentOrg } from '../../common/decorators/current-org.decorator';
import { AddonCategory } from '../../common/enums/addon-category.enum';
import { OrganizationGuard } from '../../common/guards/organization.guard';
import { RequestOrganization } from '../../common/types/request-context.type';
import { BillingService } from './billing.service';
import { AddAddonDto } from './dto/add-addon.dto';
import { CreateCheckoutSessionWithAddonsDto } from './dto/create-checkout-session-with-addons.dto';
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

  @Post('checkout-session-with-addons')
  createCheckoutSessionWithAddons(
    @CurrentOrg() organization: RequestOrganization,
    @Body() dto: CreateCheckoutSessionWithAddonsDto,
  ) {
    return this.service.createCheckoutSessionWithAddons(organization.id, dto);
  }

  @Post('addons')
  addOrUpdateAddon(
    @CurrentOrg() organization: RequestOrganization,
    @Body() dto: AddAddonDto,
  ) {
    return this.service.addOrUpdateAddon(organization.id, dto);
  }

  @Delete('addons/:category')
  removeAddon(
    @CurrentOrg() organization: RequestOrganization,
    @Param('category') category: AddonCategory,
  ) {
    return this.service.removeAddon(organization.id, category);
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