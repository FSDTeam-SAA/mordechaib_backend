import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Request } from 'express';
import { RequestUser } from '../types/request-context.type';
import { SubscriptionAccessPolicyService } from '../../modules/subscriptions/subscription-access-policy.service';

/**
 * Routes that must remain reachable while an organization selects, pays for,
 * restores, or cancels a subscription. These are deliberately narrow: normal
 * product and integration routes continue through the subscription policy.
 */
const SUBSCRIPTION_RECOVERY_PATHS = [
  '/health',
  '/auth/',
  '/subscription-plans',
  '/subscriptions',
  '/billing/',
  '/onboarding-setups',
  '/setup-packages',
  '/package-inquiries',
  '/addons/products',
  '/organizations/current',
  '/api/docs',
] as const;

/**
 * Central product-access boundary. Keeping the policy in one global guard
 * prevents product modules from implementing subtly different subscription
 * rules and makes the rollout fully reversible through the feature flag.
 */
@Injectable()
export class SubscriptionAccessGuard implements CanActivate {
  constructor(private readonly access: SubscriptionAccessPolicyService) {}

  async canActivate(context: ExecutionContext) {
    const request = context
      .switchToHttp()
      .getRequest<Request & { user?: RequestUser }>();
    const user = request.user;

    // Public/service-authenticated callbacks have no JWT user and are secured
    // by their own signature or shared-secret guards.
    if (!user) return true;
    if (user.isPlatformAdmin || this.isRecoveryPath(request.path)) return true;

    await this.access.assertCanUsePlatform(user.organizationId);
    return true;
  }

  private isRecoveryPath(path: string) {
    return SUBSCRIPTION_RECOVERY_PATHS.some((allowed) =>
      path.includes(allowed),
    );
  }
}
