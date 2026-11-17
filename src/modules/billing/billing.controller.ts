import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentOrg } from '../../common/decorators/current-org.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { AddonCategory } from '../../common/enums/addon-category.enum';
import { UserRole } from '../../common/enums/user-role.enum';
import { OrganizationGuard } from '../../common/guards/organization.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { RequestOrganization } from '../../common/types/request-context.type';
import { BillingService } from './billing.service';
import { AddAddonDto } from './dto/add-addon.dto';
import { CreateCheckoutSessionWithAddonsDto } from './dto/create-checkout-session-with-addons.dto';
import { CreateCheckoutSessionDto } from './dto/create-checkout-session.dto';
import { PauseSubscriptionDto } from './dto/pause-subscription.dto';
import { UpgradeSubscriptionDto } from './dto/upgrade-subscription.dto';
import { ReconcileUsageDto } from './dto/reconcile-usage.dto';
import { UsageBillingService } from './usage-billing.service';

@ApiTags('Billing')
@ApiBearerAuth()
@Controller('billing')
@UseGuards(OrganizationGuard)
export class BillingController {
  constructor(
    private readonly service: BillingService,
    private readonly usageBilling: UsageBillingService,
  ) {}

  @Get('usage')
  @ApiOperation({
    summary: 'Preview measured usage and usage-billing reconciliation',
  })
  usageSummary(
    @CurrentOrg() organization: RequestOrganization,
    @Query() query: ReconcileUsageDto,
  ) {
    return this.usageBilling.summary(organization.id, query);
  }

  @Post('usage/reconcile')
  @UseGuards(RolesGuard)
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiOperation({
    summary:
      'Reconcile measured usage and create idempotent Stripe invoice items',
  })
  reconcileUsage(
    @CurrentOrg() organization: RequestOrganization,
    @Body() dto: ReconcileUsageDto,
  ) {
    return this.usageBilling.reconcile(organization.id, dto);
  }

  @Post('usage/invoice')
  @UseGuards(RolesGuard)
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiOperation({
    summary:
      'Generate the Stripe invoice for a completed measured-usage period',
  })
  generateUsageInvoice(
    @CurrentOrg() organization: RequestOrganization,
    @Body() dto: ReconcileUsageDto,
  ) {
    return this.usageBilling.generateInvoice(organization.id, dto);
  }

  // First-time checkout. Cancellation lives at POST /subscriptions/me/cancel
  // (it needs the reason/password flow, not just a Stripe call) — see
  // SubscriptionsController.
  @Post('checkout-session')
  @UseGuards(RolesGuard)
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  createCheckoutSession(
    @CurrentOrg() organization: RequestOrganization,
    @Body() dto: CreateCheckoutSessionDto,
  ) {
    return this.service.createCheckoutSession(organization.id, dto);
  }

  @Post('checkout-session-with-addons')
  @UseGuards(RolesGuard)
  @Roles(UserRole.OWNER, UserRole.ADMIN)
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
