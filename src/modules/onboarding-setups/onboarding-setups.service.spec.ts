import { ConfigService } from '@nestjs/config';
import { SetupFeeType } from '../../common/enums/setup-fee-type.enum';
import { SetupStatus } from '../../common/enums/setup-status.enum';
import { SetupType } from '../../common/enums/setup-type.enum';
import { UserRole } from '../../common/enums/user-role.enum';
import { RequestUser } from '../../common/types/request-context.type';
import { SetupPackagesService } from '../setup-packages/setup-packages.service';
import { StripeProvider } from '../stripe/stripe.provider';
import { OnboardingSetupsRepository } from './onboarding-setups.repository';
import { OnboardingSetupsService } from './onboarding-setups.service';

describe('OnboardingSetupsService package catalog integration', () => {
  const repository = {
    findActiveByOrganization: jest.fn(),
    create: jest.fn(),
    pushStatusHistory: jest.fn(),
    findById: jest.fn(),
    update: jest.fn(),
    deleteById: jest.fn(),
  };
  const setupPackagesService = { findActiveById: jest.fn() };
  const stripeProvider = { createOneTimeCheckoutSession: jest.fn() };
  const config = { get: jest.fn() };
  const service = new OnboardingSetupsService(
    repository as unknown as OnboardingSetupsRepository,
    stripeProvider as unknown as StripeProvider,
    config as unknown as ConfigService,
    setupPackagesService as unknown as SetupPackagesService,
  );
  const user: RequestUser = {
    id: 'user-1',
    email: 'organizer@example.com',
    firstName: 'Test',
    lastName: 'Organizer',
    organizationId: 'org-1',
    role: UserRole.OWNER,
    sessionId: 'session-1',
    isPlatformAdmin: false,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    config.get.mockReturnValue(undefined);
  });

  it('takes a free done-for-you package straight to meeting booking', async () => {
    repository.findActiveByOrganization.mockResolvedValue(null);
    setupPackagesService.findActiveById.mockResolvedValue({
      _id: 'package-1',
      code: 'GROWTH_INTEGRATION_CALL',
      name: 'Growth Integration Call',
      setupType: SetupType.DONE_FOR_YOU,
      setupFeeType: SetupFeeType.FREE,
      price: 0,
      currency: 'USD',
      paymentRequired: false,
      meetingRequired: true,
    });
    repository.create.mockResolvedValue({
      _id: 'setup-1',
      status: SetupStatus.MEETING_PENDING,
      payment: { required: false },
    });

    const result = await service.create(user, { setupPackageId: 'package-1' });

    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        setupPackageId: 'package-1',
        setupType: SetupType.DONE_FOR_YOU,
        setupFeeType: SetupFeeType.FREE,
        status: SetupStatus.MEETING_PENDING,
        selectedSetupPackage: expect.objectContaining({
          code: 'GROWTH_INTEGRATION_CALL',
          price: 0,
        }),
      }),
    );
    expect(stripeProvider.createOneTimeCheckoutSession).not.toHaveBeenCalled();
    expect(result).not.toHaveProperty('checkoutUrl');
  });

  it('creates a checkout URL only when the selected package requires payment', async () => {
    repository.findActiveByOrganization.mockResolvedValue(null);
    setupPackagesService.findActiveById.mockResolvedValue({
      _id: 'package-2',
      code: 'ENTERPRISE_SETUP',
      name: 'Enterprise Launch Package',
      setupType: SetupType.DONE_FOR_YOU,
      setupFeeType: SetupFeeType.PAID_ADDON,
      price: 199,
      currency: 'USD',
      paymentRequired: true,
      meetingRequired: true,
    });
    const setup = {
      _id: 'setup-2',
      status: SetupStatus.PAYMENT_PENDING,
      payment: {
        required: true,
        amount: 199,
        currency: 'USD',
      },
      selectedSetupPackage: { name: 'Enterprise Launch Package' },
    };
    repository.create.mockResolvedValue(setup);
    repository.findById.mockResolvedValue(setup);
    stripeProvider.createOneTimeCheckoutSession.mockResolvedValue({
      id: 'cs_test_1',
      url: 'https://checkout.example.test/session',
    });

    const result = await service.create(user, {
      setupPackageId: 'package-2',
      paymentSuccessUrl: 'https://app.example.test/payment/success',
      paymentCancelUrl: 'https://app.example.test/payment/cancel',
    });

    expect(stripeProvider.createOneTimeCheckoutSession).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 199, currency: 'USD' }),
    );
    expect(result).toMatchObject({
      checkoutUrl: 'https://checkout.example.test/session',
    });
  });

  it('rolls back a paid setup when Stripe checkout creation fails', async () => {
    const setup = {
      _id: 'setup-rollback',
      status: SetupStatus.PAYMENT_PENDING,
      payment: { required: true, amount: 199, currency: 'USD' },
      selectedSetupPackage: { name: 'Enterprise Launch Package' },
    };
    repository.findActiveByOrganization.mockResolvedValue(null);
    repository.create.mockResolvedValue(setup);
    repository.findById.mockResolvedValue(setup);
    repository.deleteById.mockResolvedValue(true);
    setupPackagesService.findActiveById.mockResolvedValue({
      _id: 'package-enterprise',
      code: 'ENTERPRISE_SETUP',
      name: 'Enterprise Launch Package',
      setupType: SetupType.DONE_FOR_YOU,
      setupFeeType: SetupFeeType.PAID_ADDON,
      price: 199,
      currency: 'USD',
      paymentRequired: true,
      meetingRequired: true,
    });
    stripeProvider.createOneTimeCheckoutSession.mockRejectedValue(
      new Error('Stripe is unavailable'),
    );

    await expect(
      service.create(user, {
        setupPackageId: 'package-enterprise',
        paymentSuccessUrl: 'https://app.example.test/payment/success',
        paymentCancelUrl: 'https://app.example.test/payment/cancel',
      }),
    ).rejects.toThrow('Stripe is unavailable');

    expect(repository.deleteById).toHaveBeenCalledWith('setup-rollback', 'org-1');
  });

  it('reuses an unpaid setup and returns a new checkout URL instead of 409', async () => {
    const existing = {
      _id: 'setup-retry',
      status: SetupStatus.PAYMENT_PENDING,
      payment: {
        required: true,
        status: 'FAILED',
        amount: 199,
        currency: 'USD',
        provider: 'STRIPE',
      },
      selectedSetupPackage: { name: 'Enterprise Launch Package' },
    };
    repository.findActiveByOrganization.mockResolvedValue(existing);
    repository.findById.mockResolvedValue(existing);
    repository.update.mockResolvedValue(existing);
    stripeProvider.createOneTimeCheckoutSession.mockResolvedValue({
      id: 'cs_retry_1',
      url: 'https://checkout.example.test/retry',
    });

    const result = await service.create(user, {
      setupPackageId: 'ignored-while-retrying',
      paymentSuccessUrl: 'https://app.example.test/payment/success',
      paymentCancelUrl: 'https://app.example.test/payment/cancel',
    });

    expect(repository.create).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      checkoutUrl: 'https://checkout.example.test/retry',
      resumedPayment: true,
    });
  });

});
