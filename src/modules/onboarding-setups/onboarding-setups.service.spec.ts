import { ConfigService } from '@nestjs/config';
import { SetupFeeType } from '../../common/enums/setup-fee-type.enum';
import { SetupMeetingStatus } from '../../common/enums/setup-meeting-status.enum';
import { SetupPaymentStatus } from '../../common/enums/setup-payment-status.enum';
import { SetupStatus } from '../../common/enums/setup-status.enum';
import { SetupType } from '../../common/enums/setup-type.enum';
import { UserRole } from '../../common/enums/user-role.enum';
import { RequestUser } from '../../common/types/request-context.type';
import { SetupPackagesService } from '../setup-packages/setup-packages.service';
import { StripeProvider } from '../stripe/stripe.provider';
import { OnboardingSetupsRepository } from './onboarding-setups.repository';
import { OnboardingSetupsService } from './onboarding-setups.service';
import { OnboardingAvailabilityService } from './onboarding-availability.service';

describe('OnboardingSetupsService package catalog integration', () => {
  const repository = {
    findActiveByOrganization: jest.fn(),
    create: jest.fn(),
    pushStatusHistory: jest.fn(),
    findById: jest.fn(),
    update: jest.fn(),
    deleteById: jest.fn(),
    bookMeetingIfPending: jest.fn(),
  };
  const setupPackagesService = { findActiveById: jest.fn() };
  const stripeProvider = { createOneTimeCheckoutSession: jest.fn() };
  const config = { get: jest.fn() };
  const availabilityService = {
    getAvailableSlots: jest.fn(),
    resolveBookableSlot: jest.fn(),
    getAdminAvailability: jest.fn(),
    upsertAdminAvailability: jest.fn(),
  };
  const service = new OnboardingSetupsService(
    repository as unknown as OnboardingSetupsRepository,
    stripeProvider as unknown as StripeProvider,
    config as unknown as ConfigService,
    setupPackagesService as unknown as SetupPackagesService,
    availabilityService as unknown as OnboardingAvailabilityService,
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

  it('does not create onboarding data for a connections-only package', async () => {
    repository.findActiveByOrganization.mockResolvedValue(null);
    setupPackagesService.findActiveById.mockResolvedValue({
      _id: 'package-self-connect',
      code: 'SELF_CONNECT',
      name: 'Self Connect',
      setupType: SetupType.SELF_CONNECT,
      setupFeeType: SetupFeeType.INCLUDED_IN_PLAN,
      price: 0,
      currency: 'USD',
      paymentRequired: false,
      meetingRequired: false,
    });

    await expect(
      service.create(user, { setupPackageId: 'package-self-connect' }),
    ).rejects.toThrow('continue to Connections');
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('hides legacy requirements and connection progress from onboarding responses', async () => {
    repository.findById.mockResolvedValue({
      _id: 'setup-legacy',
      organizationId: 'org-1',
      status: SetupStatus.MEETING_PENDING,
      requirements: { calendarProvider: 'GOOGLE_CALENDAR' },
      progress: { calendarSetup: { status: 'COMPLETED' } },
    });

    const result = await service.findById('setup-legacy', user);

    expect(result).not.toHaveProperty('requirements');
    expect(result).not.toHaveProperty('progress');
    expect(result).toHaveProperty('statusMessage', 'Book your onboarding call');
  });

  it('returns a conflict when another customer books the slot concurrently', async () => {
    repository.findById.mockResolvedValue({
      _id: 'setup-1',
      organizationId: 'org-1',
      status: SetupStatus.MEETING_PENDING,
      payment: { required: false, status: SetupPaymentStatus.NOT_REQUIRED },
      meeting: {
        isRequired: true,
        status: SetupMeetingStatus.PENDING,
      },
    });
    availabilityService.resolveBookableSlot.mockResolvedValue({
      start: new Date('2099-10-01T03:00:00.000Z'),
      end: new Date('2099-10-01T04:30:00.000Z'),
      timezone: 'Asia/Dhaka',
    });
    repository.bookMeetingIfPending.mockRejectedValue({ code: 11000 });

    await expect(
      service.bookMeeting('setup-1', user, {
        startTime: '2099-10-01T03:00:00.000Z',
      }),
    ).rejects.toThrow('slot was just booked');
  });

});
