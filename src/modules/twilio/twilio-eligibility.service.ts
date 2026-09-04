import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SubscriptionStatus } from '../../common/enums/subscription-status.enum';
import { OrganizationsService } from '../organizations/organizations.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';

@Injectable()
export class TwilioEligibilityService {
  private readonly logger = new Logger(TwilioEligibilityService.name);

  constructor(
    private readonly subscriptions: SubscriptionsService,
    private readonly config: ConfigService,
    private readonly organizations: OrganizationsService,
  ) {
    if (!this.subscriptionEnforcementEnabled) {
      this.logger.warn(
        'Twilio subscription enforcement is disabled for non-production testing',
      );
    }
  }

  async assertCanUseCalling(organizationId: string) {
    const organization = await this.organizations.findCurrent(organizationId);
    if (organization.status !== 'ACTIVE') {
      throw new ForbiddenException(
        'The organization must be active to use Twilio calling',
      );
    }
    if (!this.subscriptionEnforcementEnabled) return;

    const { subscription } = await this.subscriptions.getMine(organizationId);
    if (
      ![SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIALING].includes(
        subscription.status,
      ) ||
      (subscription.pausedUntil && subscription.pausedUntil > new Date())
    ) {
      throw new ForbiddenException(
        'An active, unpaused subscription is required for Twilio calling',
      );
    }

    const includedMinutes =
      subscription.snapshotLimits?.callMinutesPerMonth ?? 0;
    if (includedMinutes <= 0) {
      throw new ForbiddenException(
        'The current subscription does not include calling',
      );
    }

    return subscription;
  }

  private get subscriptionEnforcementEnabled() {
    return this.config.get<boolean>(
      'twilio.subscriptionEnforcementEnabled',
      true,
    );
  }

  assertDestinationsAllowed(...phoneNumbers: Array<string | undefined>) {
    const allowedPrefixes = this.config.get<string[]>(
      'twilio.allowedCallPrefixes',
      [],
    );
    if (!allowedPrefixes.length) return;
    for (const phoneNumber of phoneNumbers) {
      if (
        phoneNumber &&
        !allowedPrefixes.some((prefix) => phoneNumber.startsWith(prefix))
      ) {
        throw new ForbiddenException(
          'Calling this international destination is not permitted',
        );
      }
    }
  }
}
