import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentOrg } from '../../common/decorators/current-org.decorator';
import { OrganizationGuard } from '../../common/guards/organization.guard';
import { RequestOrganization } from '../../common/types/request-context.type';
import { CreateCheckoutSessionDto } from './dto/create-checkout-session.dto';
import { BillingService } from './billing.service';

@ApiTags('Billing')
@ApiBearerAuth()
@Controller('billing')
@UseGuards(OrganizationGuard)
export class BillingController {
  constructor(private readonly service: BillingService) {}

  @Post('checkout-session')
  createCheckoutSession(
    @CurrentOrg() organization: RequestOrganization,
    @Body() dto: CreateCheckoutSessionDto,
  ) {
    return this.service.createCheckoutSession(organization.id, dto);
  }

  @Post('cancel')
  cancelSubscription(@CurrentOrg() organization: RequestOrganization) {
    return this.service.cancelSubscription(organization.id);
  }
}
