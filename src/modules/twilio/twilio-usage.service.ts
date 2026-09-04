import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UserRole } from '../../common/enums/user-role.enum';
import { sendEmail } from '../../common/helpers/mailer.helper';
import { StripeProvider } from '../stripe/stripe.provider';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { UsersService } from '../users/users.service';
import { TwilioProvisioningQueue } from './twilio-provisioning.queue';
import { TwilioUsageRepository } from './twilio-usage.repository';

@Injectable()
export class TwilioUsageService {
  private readonly logger = new Logger(TwilioUsageService.name);

  constructor(
    private readonly repository: TwilioUsageRepository,
    private readonly subscriptions: SubscriptionsService,
    private readonly stripe: StripeProvider,
    private readonly queue: TwilioProvisioningQueue,
    private readonly config: ConfigService,
    private readonly users: UsersService,
  ) {}

  async recordCompletedCall(
    organizationId: string,
    callSid: string,
    durationSeconds: number | undefined,
  ) {
    if (!durationSeconds || durationSeconds <= 0) return;
    const subscription = this.subscriptionEnforcementEnabled
      ? (await this.subscriptions.getMine(organizationId)).subscription
      : undefined;
    const { periodStart, periodEnd } = this.resolvePeriod(subscription);
    const event = await this.repository.createCallEvent({
      organizationId,
      callSid,
      durationSeconds,
      periodStart,
      periodEnd,
    });
    if (!event) {
      const existing = await this.repository.findEvent(callSid);
      if (
        this.subscriptionEnforcementEnabled &&
        existing &&
        ['PENDING', 'FAILED'].includes(existing.billingStatus || '') &&
        (existing.cost ?? 0) > 0
      ) {
        await this.queue.enqueueOverageBilling(callSid);
      }
      return;
    }

    const period = await this.repository.incrementPeriod({
      organizationId,
      periodStart,
      periodEnd,
      durationSeconds,
    });
    const totalSeconds = period?.totalSeconds ?? durationSeconds;
    if (!this.subscriptionEnforcementEnabled) {
      await this.repository.updateEventBilling(callSid, {
        includedQuantity: durationSeconds,
        overageQuantity: 0,
        cost: 0,
        billingStatus: 'NOT_REQUIRED',
      });
      await this.sendUsageAlerts({
        organizationId,
        periodStart,
        periodEnd,
        durationSeconds,
        totalSeconds,
        includedSeconds: 0,
        overageSeconds: 0,
        overageRateUsd: 0,
      });
      return;
    }
    if (!subscription) {
      throw new Error('Twilio subscription context is unavailable');
    }

    const previousSeconds = Math.max(0, totalSeconds - durationSeconds);
    const includedSeconds =
      (subscription.snapshotLimits?.callMinutesPerMonth ?? 0) * 60;
    const overageBefore = Math.max(0, previousSeconds - includedSeconds);
    const overageAfter = Math.max(0, totalSeconds - includedSeconds);
    const overageSeconds = overageAfter - overageBefore;
    const includedQuantity = durationSeconds - overageSeconds;
    const rate = subscription.snapshotLimits?.extraCallMinutePriceUsd ?? 0;
    const costBeforeCents = Math.ceil((overageBefore / 60) * rate * 100);
    const costAfterCents = Math.ceil((overageAfter / 60) * rate * 100);
    const amountCents = Math.max(0, costAfterCents - costBeforeCents);

    await this.repository.updateEventBilling(callSid, {
      includedQuantity,
      overageQuantity: overageSeconds,
      cost: amountCents / 100,
      billingStatus: amountCents > 0 ? 'PENDING' : 'NOT_REQUIRED',
    });
    if (amountCents > 0) await this.queue.enqueueOverageBilling(callSid);
    try {
      await this.sendUsageAlerts({
        organizationId,
        periodStart,
        periodEnd,
        durationSeconds,
        totalSeconds,
        includedSeconds,
        overageSeconds: overageAfter,
        overageRateUsd: rate,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `Unable to process Twilio usage alerts for ${organizationId}: ${message}`,
      );
    }
  }

  async processOverageBilling(callSid: string) {
    const event = await this.repository.findEvent(callSid);
    if (!event || event.billingStatus === 'BILLED') return;
    if (!this.subscriptionEnforcementEnabled) {
      await this.repository.updateEventBilling(callSid, {
        includedQuantity: event.quantity,
        overageQuantity: 0,
        cost: 0,
        billingStatus: 'NOT_REQUIRED',
      });
      return;
    }
    const amountCents = Math.round((event.cost ?? 0) * 100);
    if (amountCents <= 0) return;

    const { subscription } = await this.subscriptions.getMine(
      event.organizationId,
    );
    if (!subscription.stripeCustomerId) {
      throw new Error(
        'Subscription has no Stripe customer for overage billing',
      );
    }
    try {
      const invoiceItem = await this.stripe.createCallOverageInvoiceItem({
        customerId: subscription.stripeCustomerId,
        amountCents,
        organizationId: event.organizationId,
        callSid,
        durationSeconds: event.overageQuantity ?? event.quantity,
      });
      await this.repository.updateEventBilling(callSid, {
        includedQuantity: event.includedQuantity ?? 0,
        overageQuantity: event.overageQuantity ?? 0,
        cost: event.cost ?? 0,
        billingStatus: 'BILLED',
        stripeInvoiceItemId: invoiceItem.id,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Billing failed';
      await this.repository.updateEventBilling(callSid, {
        includedQuantity: event.includedQuantity ?? 0,
        overageQuantity: event.overageQuantity ?? 0,
        cost: event.cost ?? 0,
        billingStatus: 'FAILED',
        billingError: message.slice(0, 500),
      });
      throw error;
    }
  }

  async assertWithinSpendingLimit(organizationId: string) {
    if (!this.subscriptionEnforcementEnabled) return;

    const { subscription } = await this.subscriptions.getMine(organizationId);
    const { periodStart, periodEnd } = this.resolvePeriod(subscription);
    const period = await this.repository.findCurrentPeriod(
      organizationId,
      new Date(),
    );
    if (!period) return;
    const includedSeconds =
      (subscription.snapshotLimits?.callMinutesPerMonth ?? 0) * 60;
    const overageSeconds = Math.max(0, period.totalSeconds - includedSeconds);
    const rate = subscription.snapshotLimits?.extraCallMinutePriceUsd ?? 0;
    const overageUsd = (overageSeconds / 60) * rate;
    const limitUsd = this.config.get<number>(
      'twilio.maxOverageUsdPerPeriod',
      100,
    );
    if (overageUsd >= limitUsd) {
      this.logger.warn(
        `Twilio overage limit reached for organization ${organizationId} in ${periodStart.toISOString()}-${periodEnd.toISOString()}`,
      );
      throw new ForbiddenException(
        'The calling overage spending limit has been reached',
      );
    }
  }

  async getCurrentUsage(organizationId: string) {
    const subscription = this.subscriptionEnforcementEnabled
      ? (await this.subscriptions.getMine(organizationId)).subscription
      : undefined;
    const { periodStart, periodEnd } = this.resolvePeriod(subscription);
    const period = await this.repository.findCurrentPeriod(
      organizationId,
      new Date(),
    );
    const usedSeconds = period?.totalSeconds ?? 0;
    const includedMinutes = subscription
      ? (subscription.snapshotLimits?.callMinutesPerMonth ?? 0)
      : null;
    if (includedMinutes === null) {
      return {
        periodStart,
        periodEnd,
        subscriptionEnforcementEnabled: false,
        includedMinutes: null,
        usedSeconds,
        usedMinutes: Number((usedSeconds / 60).toFixed(2)),
        remainingIncludedMinutes: null,
        overageSeconds: 0,
        overageMinutes: 0,
        overageRateUsd: 0,
        estimatedOverageUsd: 0,
        spendingLimitUsd: null,
      };
    }
    const includedSeconds = includedMinutes * 60;
    const overageSeconds = Math.max(0, usedSeconds - includedSeconds);
    const overageRateUsd =
      subscription?.snapshotLimits?.extraCallMinutePriceUsd ?? 0;

    return {
      periodStart,
      periodEnd,
      includedMinutes,
      usedSeconds,
      usedMinutes: Number((usedSeconds / 60).toFixed(2)),
      remainingIncludedMinutes: Number(
        (Math.max(0, includedSeconds - usedSeconds) / 60).toFixed(2),
      ),
      overageSeconds,
      overageMinutes: Number((overageSeconds / 60).toFixed(2)),
      overageRateUsd,
      estimatedOverageUsd: Number(
        ((overageSeconds / 60) * overageRateUsd).toFixed(2),
      ),
      spendingLimitUsd: this.config.get<number>(
        'twilio.maxOverageUsdPerPeriod',
        100,
      ),
      subscriptionEnforcementEnabled: true,
    };
  }

  private resolvePeriod(
    subscription:
      | {
          currentPeriodStart?: Date;
          currentPeriodEnd?: Date;
        }
      | undefined,
  ) {
    if (subscription?.currentPeriodStart && subscription.currentPeriodEnd) {
      return {
        periodStart: new Date(subscription.currentPeriodStart),
        periodEnd: new Date(subscription.currentPeriodEnd),
      };
    }
    const now = new Date();
    const periodStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
    );
    const periodEnd = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1),
    );
    return { periodStart, periodEnd };
  }

  private get subscriptionEnforcementEnabled() {
    return this.config.get<boolean>(
      'twilio.subscriptionEnforcementEnabled',
      true,
    );
  }

  private async sendUsageAlerts(input: {
    organizationId: string;
    periodStart: Date;
    periodEnd: Date;
    durationSeconds: number;
    totalSeconds: number;
    includedSeconds: number;
    overageSeconds: number;
    overageRateUsd: number;
  }) {
    const alerts: Array<{
      field:
        | 'includedUsageAlertSentAt'
        | 'unusualUsageAlertSentAt'
        | 'spendingAlertSentAt';
      subject: string;
      text: string;
    }> = [];
    if (
      input.includedSeconds > 0 &&
      input.totalSeconds >= input.includedSeconds * 0.8
    ) {
      alerts.push({
        field: 'includedUsageAlertSentAt',
        subject: 'Calling allowance is nearly used',
        text: `Your organization has used ${Math.round(input.totalSeconds / 60)} of ${Math.round(input.includedSeconds / 60)} included call minutes.`,
      });
    }

    const unusualSeconds =
      this.config.get<number>('twilio.unusualCallMinutes', 60) * 60;
    if (input.durationSeconds >= unusualSeconds) {
      alerts.push({
        field: 'unusualUsageAlertSentAt',
        subject: 'Unusually long Twilio call detected',
        text: `A ${Math.round(input.durationSeconds / 60)} minute call was recorded for your organization. Review your call history if this was unexpected.`,
      });
    }

    const overageUsd = (input.overageSeconds / 60) * input.overageRateUsd;
    const spendingLimitUsd = this.config.get<number>(
      'twilio.maxOverageUsdPerPeriod',
      100,
    );
    if (overageUsd >= spendingLimitUsd * 0.8) {
      alerts.push({
        field: 'spendingAlertSentAt',
        subject: 'Calling spending limit is nearly reached',
        text: `Estimated calling overage is $${overageUsd.toFixed(2)} against the $${spendingLimitUsd.toFixed(2)} period limit.`,
      });
    }

    if (!alerts.length) return;
    const organizationUsers = await this.users.findByOrganization(
      input.organizationId,
    );
    const owner = organizationUsers.find(
      (user) => user.role === UserRole.OWNER,
    );
    if (!owner) return;

    for (const alert of alerts) {
      const claimed = await this.repository.claimAlert(
        input.organizationId,
        input.periodStart,
        input.periodEnd,
        alert.field,
      );
      if (!claimed) continue;
      await sendEmail(this.config, {
        to: owner.email,
        subject: alert.subject,
        text: alert.text,
      });
    }
  }
}
