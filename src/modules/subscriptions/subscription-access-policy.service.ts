import { ForbiddenException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SubscriptionStatus } from '../../common/enums/subscription-status.enum';
import { OrganizationSubscription } from '../../database/schemas/organization-subscription.schema';
import { SubscriptionsRepository } from './subscriptions.repository';

export enum SubscriptionAccessReason {
  GATE_DISABLED = 'GATE_DISABLED',
  ELIGIBLE = 'ELIGIBLE',
  NO_SUBSCRIPTION = 'NO_SUBSCRIPTION',
  INCOMPLETE = 'INCOMPLETE',
  PAST_DUE = 'PAST_DUE',
  CANCELED = 'CANCELED',
  PAUSED = 'PAUSED',
}

export type SubscriptionAccessDecision = {
  gateEnabled: boolean;
  canUsePlatform: boolean;
  subscriptionRequired: boolean;
  subscriptionActive: boolean;
  reason: SubscriptionAccessReason;
  subscriptionStatus: SubscriptionStatus | null;
};

type AccessSubscription = Pick<
  OrganizationSubscription,
  'status' | 'pausedUntil'
>;

const ELIGIBLE_STATUSES = new Set<SubscriptionStatus>([
  SubscriptionStatus.ACTIVE,
  SubscriptionStatus.TRIALING,
]);

/**
 * Authoritative product-access policy shared by onboarding and protected
 * product modules. Setup-package payments are intentionally not considered:
 * only an organization subscription can unlock product usage.
 */
@Injectable()
export class SubscriptionAccessPolicyService {
  constructor(
    private readonly subscriptions: SubscriptionsRepository,
    private readonly config: ConfigService,
  ) {}

  async getDecision(
    organizationId: string,
    now = new Date(),
  ): Promise<SubscriptionAccessDecision> {
    if (!this.gateEnabled) {
      return this.decision({
        canUsePlatform: true,
        subscriptionActive: false,
        reason: SubscriptionAccessReason.GATE_DISABLED,
        status: null,
      });
    }

    const subscription =
      await this.subscriptions.findByOrganizationId(organizationId);
    return this.evaluate(subscription, now);
  }

  async assertCanUsePlatform(organizationId: string, now = new Date()) {
    const decision = await this.getDecision(organizationId, now);
    if (!decision.canUsePlatform) {
      throw new ForbiddenException({
        message: this.denialMessage(decision.reason),
        code: `SUBSCRIPTION_${decision.reason}`,
      });
    }
    return decision;
  }

  private evaluate(
    subscription: AccessSubscription | null,
    now: Date,
  ): SubscriptionAccessDecision {
    if (!subscription) {
      return this.decision({
        canUsePlatform: false,
        subscriptionActive: false,
        reason: SubscriptionAccessReason.NO_SUBSCRIPTION,
        status: null,
      });
    }

    if (ELIGIBLE_STATUSES.has(subscription.status)) {
      if (subscription.pausedUntil && subscription.pausedUntil > now) {
        return this.decision({
          canUsePlatform: false,
          subscriptionActive: false,
          reason: SubscriptionAccessReason.PAUSED,
          status: subscription.status,
        });
      }
      return this.decision({
        canUsePlatform: true,
        subscriptionActive: true,
        reason: SubscriptionAccessReason.ELIGIBLE,
        status: subscription.status,
      });
    }

    return this.decision({
      canUsePlatform: false,
      subscriptionActive: false,
      reason: this.statusReason(subscription.status),
      status: subscription.status,
    });
  }

  private decision(input: {
    canUsePlatform: boolean;
    subscriptionActive: boolean;
    reason: SubscriptionAccessReason;
    status: SubscriptionStatus | null;
  }): SubscriptionAccessDecision {
    return {
      gateEnabled: this.gateEnabled,
      canUsePlatform: input.canUsePlatform,
      subscriptionRequired: this.gateEnabled && !input.canUsePlatform,
      subscriptionActive: input.subscriptionActive,
      reason: input.reason,
      subscriptionStatus: input.status,
    };
  }

  private statusReason(status: SubscriptionStatus) {
    const reasons: Record<SubscriptionStatus, SubscriptionAccessReason> = {
      [SubscriptionStatus.ACTIVE]: SubscriptionAccessReason.ELIGIBLE,
      [SubscriptionStatus.TRIALING]: SubscriptionAccessReason.ELIGIBLE,
      [SubscriptionStatus.INCOMPLETE]: SubscriptionAccessReason.INCOMPLETE,
      [SubscriptionStatus.PAST_DUE]: SubscriptionAccessReason.PAST_DUE,
      [SubscriptionStatus.CANCELED]: SubscriptionAccessReason.CANCELED,
    };
    return reasons[status];
  }

  private denialMessage(reason: SubscriptionAccessReason) {
    const messages: Partial<Record<SubscriptionAccessReason, string>> = {
      [SubscriptionAccessReason.NO_SUBSCRIPTION]:
        'Select and activate a subscription to use the platform',
      [SubscriptionAccessReason.INCOMPLETE]:
        'Complete subscription payment to use the platform',
      [SubscriptionAccessReason.PAST_DUE]:
        'Resolve the past-due subscription payment to use the platform',
      [SubscriptionAccessReason.CANCELED]:
        'Activate a subscription to use the platform',
      [SubscriptionAccessReason.PAUSED]:
        'Resume the subscription to use the platform',
    };
    return messages[reason] ?? 'An active subscription is required';
  }

  private get gateEnabled() {
    return this.config.get<boolean>('subscriptions.accessGateEnabled', false);
  }
}
