import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentOrg } from '../../common/decorators/current-org.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { OrganizationGuard } from '../../common/guards/organization.guard';
import {
  RequestOrganization,
  RequestUser,
} from '../../common/types/request-context.type';
import { CancellationsService } from './cancellations.service';
import { CancelSubscriptionDto } from './dto/cancel-subscription.dto';
import { DowngradeRequestDto } from './dto/downgrade-request.dto';
import { SpecialistRequestDto } from './dto/specialist-request.dto';
import { SubscriptionsService } from './subscriptions.service';

@ApiTags('Subscriptions')
@ApiBearerAuth()
@Controller('subscriptions')
@UseGuards(OrganizationGuard)
export class SubscriptionsController {
  constructor(
    private readonly service: SubscriptionsService,
    private readonly cancellationsService: CancellationsService,
  ) {}

  // Checkout, upgrade, and pause live under /billing — they need the
  // Stripe client. This controller is the subscription-record side.
  @Get('me')
  getMine(@CurrentOrg() organization: RequestOrganization) {
    return this.service.getMine(organization.id);
  }

  // Screens 1+2+7+8 combined — reason, which retention offer they saw,
  // and password confirmation, submitted together once they hit
  // "Verify & Continue". Nothing is charged/cancelled yet — see Screen 9.
  @Post('me/cancel')
  requestCancellation(
    @CurrentOrg() organization: RequestOrganization,
    @CurrentUser() user: RequestUser,
    @Body() dto: CancelSubscriptionDto,
  ) {
    return this.cancellationsService.requestCancellation(
      organization.id,
      user.id,
      dto,
    );
  }

  // Screen 9 — lets the frontend show "still pending, effective on X"
  // on repeat visits, and decide whether to show the undo button at all.
  @Get('me/cancel')
  getMyPendingCancellation(@CurrentOrg() organization: RequestOrganization) {
    return this.cancellationsService.getMyPendingCancellation(
      organization.id,
    );
  }

  // Screen 10's "Undo cancellation" button.
  @Post('me/cancel/undo')
  undoMyCancellation(@CurrentOrg() organization: RequestOrganization) {
    return this.cancellationsService.undoMyCancellation(organization.id);
  }

  // Screen 4 — always a sales lead, never a direct plan change.
  @Post('me/downgrade-request')
  requestDowngrade(
    @CurrentOrg() organization: RequestOrganization,
    @CurrentUser() user: RequestUser,
    @Body() dto: DowngradeRequestDto,
  ) {
    return this.service.requestDowngrade(
      organization.id,
      {
        fullName: `${user.firstName} ${user.lastName}`.trim(),
        email: user.email,
      },
      dto,
    );
  }

  // Screen 5 — "Talk to a Specialist".
  @Post('me/specialist-request')
  requestSpecialistCall(
    @CurrentOrg() organization: RequestOrganization,
    @CurrentUser() user: RequestUser,
    @Body() dto: SpecialistRequestDto,
  ) {
    return this.service.requestSpecialistCall(
      organization.id,
      {
        fullName: `${user.firstName} ${user.lastName}`.trim(),
        email: user.email,
      },
      dto,
    );
  }
}