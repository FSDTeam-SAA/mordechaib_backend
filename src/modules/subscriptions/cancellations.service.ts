import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { CancellationReason } from '../../common/enums/cancellation-reason.enum';
import { RetentionOfferChoice } from '../../common/enums/retention-offer-choice.enum';
import { AuthService } from '../auth/auth.service';
import { StripeProvider } from '../stripe/stripe.provider';
import { CancelSubscriptionDto } from './dto/cancel-subscription.dto';
import { ListCancellationRequestsQueryDto } from './dto/list-cancellation-requests-query.dto';
import { CancellationRequestsRepository } from './cancellation-requests.repository';
import { SubscriptionsService } from './subscriptions.service';

const GRACE_PERIOD_DAYS = 7;

@Injectable()
export class CancellationsService {
  constructor(
    private readonly repository: CancellationRequestsRepository,
    private readonly subscriptionsService: SubscriptionsService,
    private readonly authService: AuthService,
    private readonly stripeProvider: StripeProvider,
  ) {}

  // Screens 1+2+7+8 land here as one call once the user password-confirms.
  async requestCancellation(
    organizationId: string,
    userId: string,
    dto: CancelSubscriptionDto,
  ) {
    if (dto.reason === CancellationReason.OTHER && !dto.reasonDetail) {
      throw new BadRequestException(
        'reasonDetail is required when reason is OTHER',
      );
    }

    const passwordValid = await this.authService.verifyPassword(
      userId,
      dto.password,
    );
    if (!passwordValid) {
      throw new UnauthorizedException('Incorrect password');
    }

    const existingRequest =
      await this.repository.findActiveForOrganization(organizationId);
    if (existingRequest) {
      throw new ConflictException(
        'A cancellation is already scheduled for this organization',
      );
    }

    const { subscription } =
      await this.subscriptionsService.getMine(organizationId);
    if (!subscription.stripeSubscriptionId) {
      throw new BadRequestException('No active Stripe subscription found');
    }

    const scheduledCancelAt = new Date();
    scheduledCancelAt.setUTCDate(
      scheduledCancelAt.getUTCDate() + GRACE_PERIOD_DAYS,
    );

    return this.repository.create({
      organizationId,
      subscriptionId: String(subscription._id),
      stripeSubscriptionId: subscription.stripeSubscriptionId,
      reason: dto.reason,
      reasonDetail: dto.reasonDetail,
      retentionOfferChoice:
        dto.retentionOfferChoice ?? RetentionOfferChoice.NONE,
      scheduledCancelAt,
    });
  }

  // Screen 9's "still active until then" banner reads from this on
  // repeat visits, and it's how the frontend knows whether to show the
  // "Undo cancellation" button at all.
  getMyPendingCancellation(organizationId: string) {
    return this.repository.findActiveForOrganization(organizationId);
  }

  async undoMyCancellation(organizationId: string) {
    const request =
      await this.repository.findActiveForOrganization(organizationId);
    if (!request) {
      throw new NotFoundException('No pending cancellation to undo');
    }
    return this.repository.markUndone(String(request._id));
  }

  // Admin queue.
  async listForAdmin(query: ListCancellationRequestsQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const { items, total } = await this.repository.listForAdmin({
      status: query.status,
      page,
      limit,
    });
    return {
      items,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    };
  }

  async undoByAdmin(id: string) {
    const request = await this.repository.findById(id);
    if (!request) {
      throw new NotFoundException('Cancellation request not found');
    }
    return this.repository.markUndone(id);
  }

  // Admin acting early, or the cron once scheduledCancelAt has passed —
  // both call this. Only now does Stripe actually get told to cancel.
  async execute(id: string, executedBy: 'CRON' | 'ADMIN') {
    const request = await this.repository.findById(id);
    if (!request) {
      throw new NotFoundException('Cancellation request not found');
    }

    const currentSubscription =
      await this.subscriptionsService.findByStripeSubscriptionId(
        request.stripeSubscriptionId,
      );
    if (!currentSubscription) {
      throw new NotFoundException(
        'The underlying subscription no longer exists',
      );
    }

    // cancel_at_period_end, not an immediate hard cancel — no billing
    // edge cases, no partial-period refund logic to get wrong. Status
    // itself flips to CANCELED later, when Stripe's own
    // customer.subscription.deleted webhook fires at the real period end.
    await this.stripeProvider.cancelSubscription(request.stripeSubscriptionId);
    await this.subscriptionsService.syncSubscriptionStatus({
      stripeSubscriptionId: request.stripeSubscriptionId,
      status: currentSubscription.status,
      cancelAtPeriodEnd: true,
    });

    return this.repository.markExecuted(id, executedBy);
  }
}