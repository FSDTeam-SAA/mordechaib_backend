import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentOrg } from '../../common/decorators/current-org.decorator';
import { OrganizationGuard } from '../../common/guards/organization.guard';
import { RequestOrganization } from '../../common/types/request-context.type';
import { SubscriptionsService } from './subscriptions.service';

@ApiTags('Subscriptions')
@ApiBearerAuth()
@Controller('subscriptions')
@UseGuards(OrganizationGuard)
export class SubscriptionsController {
  constructor(private readonly service: SubscriptionsService) {}

  // Checkout and cancellation live under /billing — they need the Stripe
  // client. This endpoint is just the read side.
  @Get('me')
  getMine(@CurrentOrg() organization: RequestOrganization) {
    return this.service.getMine(organization.id);
  }
}
