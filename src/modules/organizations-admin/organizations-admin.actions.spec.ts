import { AUDIT_ACTION } from '../../common/constants/audit-action.constants';
import { OrganizationStatus } from '../../common/enums/organization-status.enum';
import { SubscriptionStatus } from '../../common/enums/subscription-status.enum';
import { UserRole } from '../../common/enums/user-role.enum';
import { OrganizationsAdminService } from './organizations-admin.service';

describe('OrganizationsAdminService actions', () => {
  const actor = {
    id: 'admin-1',
    email: 'admin@noltra.ai',
    firstName: 'Platform',
    lastName: 'Admin',
    organizationId: 'platform-org',
    role: UserRole.OWNER,
    sessionId: 'session-1',
    isPlatformAdmin: true,
  };

  it('treats a repeated status update as an idempotent success', async () => {
    const context = serviceContext({
      organization: {
        _id: 'organization-1',
        name: 'Acme',
        isInternal: false,
        status: OrganizationStatus.ACTIVE,
      },
    });
    jest
      .spyOn(context.service, 'getById')
      .mockResolvedValue({ organization: { id: 'organization-1' } } as never);

    const result = await context.service.updateStatus(
      'organization-1',
      { status: OrganizationStatus.ACTIVE },
      actor,
    );

    expect(result.operation).toEqual({
      type: 'STATUS_UPDATE',
      changed: false,
      duplicate: true,
    });
    expect(context.organizations.findByIdAndUpdate).not.toHaveBeenCalled();
    expect(context.audits.create).not.toHaveBeenCalled();
  });

  it('does not call Stripe when the requested plan and interval are current', async () => {
    const context = serviceContext({
      subscription: {
        _id: 'subscription-1',
        organizationId: 'organization-1',
        planId: '507f1f77bcf86cd799439011',
        billingInterval: 'month',
        status: SubscriptionStatus.ACTIVE,
        stripeSubscriptionId: 'sub_123',
      },
    });
    jest
      .spyOn(context.service, 'getById')
      .mockResolvedValue({ organization: { id: 'organization-1' } } as never);

    const result = await context.service.changePlan(
      'organization-1',
      {
        planId: '507f1f77bcf86cd799439011',
        billingInterval: 'month',
      },
      actor,
    );

    expect(result.operation).toEqual({
      type: 'PLAN_CHANGE',
      changed: false,
      duplicate: true,
    });
    expect(context.plans.findById).not.toHaveBeenCalled();
    expect(context.stripe.upgradeSubscriptionPrice).not.toHaveBeenCalled();
    expect(context.audits.create).not.toHaveBeenCalled();
  });

  it('changes a supported plan once with Stripe idempotency and an audit record', async () => {
    const context = serviceContext({
      subscription: {
        _id: 'subscription-1',
        organizationId: 'organization-1',
        planId: '507f1f77bcf86cd799439011',
        billingInterval: 'month',
        status: SubscriptionStatus.ACTIVE,
        stripeSubscriptionId: 'sub_123',
      },
    });
    context.plans.findById.mockResolvedValue({
      _id: '507f191e810c19729de860ea',
      isInquiryOnly: false,
      billingCycles: ['month', 'year'],
    });
    context.plans.ensureCheckoutPrice.mockResolvedValue('price_yearly');
    context.subscriptionsService.updatePlanFromPlatformAdmin.mockResolvedValue({
      _id: 'subscription-1',
    });
    jest
      .spyOn(context.service, 'getById')
      .mockResolvedValue({ organization: { id: 'organization-1' } } as never);

    const result = await context.service.changePlan(
      'organization-1',
      {
        planId: '507f191e810c19729de860ea',
        billingInterval: 'year',
      },
      actor,
    );

    expect(result.operation).toEqual({
      type: 'PLAN_CHANGE',
      changed: true,
      duplicate: false,
    });
    expect(context.stripe.upgradeSubscriptionPrice).toHaveBeenCalledWith(
      'sub_123',
      'price_yearly',
      expect.stringMatching(/^admin-plan-change-[a-f0-9]{64}$/),
    );
    expect(context.audits.create).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AUDIT_ACTION.SUBSCRIPTION_PLAN_CHANGED_BY_PLATFORM_ADMIN,
        organizationId: 'organization-1',
        userId: actor.id,
        metadata: expect.objectContaining({
          previousPlanId: '507f1f77bcf86cd799439011',
          previousBillingInterval: 'month',
          planId: '507f191e810c19729de860ea',
          billingInterval: 'year',
          stripeIdempotencyKey: expect.stringMatching(
            /^admin-plan-change-[a-f0-9]{64}$/,
          ),
        }),
      }),
    );
  });
});

function serviceContext(input?: {
  organization?: Record<string, unknown>;
  subscription?: Record<string, unknown>;
}) {
  const organization = input?.organization ?? {
    _id: 'organization-1',
    name: 'Acme',
    isInternal: false,
    status: OrganizationStatus.ACTIVE,
  };
  const organizations = {
    findById: jest.fn().mockReturnValue(queryResult(organization)),
    findByIdAndUpdate: jest.fn().mockReturnValue({
      exec: jest.fn().mockResolvedValue(organization),
    }),
  };
  const subscriptions = {
    findOne: jest
      .fn()
      .mockReturnValue(queryResult(input?.subscription ?? null)),
  };
  const plans = {
    findById: jest.fn(),
    ensureCheckoutPrice: jest.fn(),
  };
  const subscriptionsService = {
    updatePlanFromPlatformAdmin: jest.fn(),
  };
  const stripe = { upgradeSubscriptionPrice: jest.fn() };
  const operationLeases = {
    runExclusive: jest.fn().mockImplementation(({ execute }) => execute()),
  };
  const audits = {
    create: jest.fn().mockResolvedValue({}),
  };
  const service = new OrganizationsAdminService(
    organizations as never,
    {} as never,
    subscriptions as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    plans as never,
    subscriptionsService as never,
    stripe as never,
    {} as never,
    operationLeases as never,
    audits as never,
  );
  return {
    service,
    organizations,
    plans,
    subscriptionsService,
    stripe,
    operationLeases,
    audits,
  };
}

function queryResult<T>(value: T) {
  return {
    lean: jest.fn().mockReturnValue({
      exec: jest.fn().mockResolvedValue(value),
    }),
  };
}
