import { SetupStatus } from '../../common/enums/setup-status.enum';
import { SetupType } from '../../common/enums/setup-type.enum';
import { UserRole } from '../../common/enums/user-role.enum';
import { RequestUser } from '../../common/types/request-context.type';
import { OrganizationsService } from '../organizations/organizations.service';
import { SetupPackagesService } from '../setup-packages/setup-packages.service';
import {
  SubscriptionAccessPolicyService,
  SubscriptionAccessReason,
} from '../subscriptions/subscription-access-policy.service';
import {
  OnboardingJourneyNextStep,
  OnboardingJourneyService,
} from './onboarding-journey.service';
import { OnboardingSetupsRepository } from './onboarding-setups.repository';

describe('OnboardingJourneyService', () => {
  const user: RequestUser = {
    id: 'user-1',
    email: 'owner@example.com',
    firstName: 'Owner',
    lastName: 'User',
    organizationId: 'organization-1',
    role: UserRole.OWNER,
    sessionId: 'session-1',
    isPlatformAdmin: false,
  };

  const blockedSubscription = {
    gateEnabled: true,
    canUsePlatform: false,
    subscriptionRequired: true,
    subscriptionActive: false,
    reason: SubscriptionAccessReason.NO_SUBSCRIPTION,
    subscriptionStatus: null,
  };
  const eligibleSubscription = {
    ...blockedSubscription,
    canUsePlatform: true,
    subscriptionRequired: false,
    subscriptionActive: true,
    reason: SubscriptionAccessReason.ELIGIBLE,
  };

  let organizations: {
    findCurrent: jest.Mock;
    selectSetupPath: jest.Mock;
  };
  let setupPackages: { findActiveById: jest.Mock };
  let subscriptionAccess: { getDecision: jest.Mock };
  let setups: { findActiveByOrganization: jest.Mock };
  let service: OnboardingJourneyService;

  beforeEach(() => {
    organizations = {
      findCurrent: jest.fn(),
      selectSetupPath: jest.fn(),
    };
    setupPackages = { findActiveById: jest.fn() };
    subscriptionAccess = {
      getDecision: jest.fn().mockResolvedValue(blockedSubscription),
    };
    setups = { findActiveByOrganization: jest.fn() };
    service = new OnboardingJourneyService(
      organizations as unknown as OrganizationsService,
      setupPackages as unknown as SetupPackagesService,
      subscriptionAccess as unknown as SubscriptionAccessPolicyService,
      setups as unknown as OnboardingSetupsRepository,
    );
  });

  it('requires setup-path selection before any setup or subscription step', async () => {
    organizations.findCurrent.mockResolvedValue({});

    const result = await service.getJourney(user);

    expect(result.nextStep).toBe(
      OnboardingJourneyNextStep.SELECT_SETUP_PATH,
    );
    expect(setups.findActiveByOrganization).not.toHaveBeenCalled();
  });

  it('requires an eligible subscription before self setup', async () => {
    organizations.findCurrent.mockResolvedValue({
      setupType: SetupType.SELF_CONNECT,
      setupPackageId: 'package-self',
    });
    setups.findActiveByOrganization.mockResolvedValue(null);

    const result = await service.getJourney(user);

    expect(result.nextStep).toBe(
      OnboardingJourneyNextStep.SELECT_SUBSCRIPTION,
    );
  });

  it('continues self setup after subscription access is eligible', async () => {
    organizations.findCurrent.mockResolvedValue({
      setupType: SetupType.SELF_CONNECT,
      setupPackageId: 'package-self',
    });
    subscriptionAccess.getDecision.mockResolvedValue(eligibleSubscription);
    setups.findActiveByOrganization.mockResolvedValue(null);

    const result = await service.getJourney(user);

    expect(result.nextStep).toBe(
      OnboardingJourneyNextStep.CONTINUE_SELF_SETUP,
    );
  });

  it('allows done-for-you setup to start before a product subscription', async () => {
    organizations.findCurrent.mockResolvedValue({
      setupType: SetupType.DONE_FOR_YOU,
      setupPackageId: 'package-assisted',
    });
    setups.findActiveByOrganization.mockResolvedValue(null);

    const result = await service.getJourney(user);

    expect(result.nextStep).toBe(
      OnboardingJourneyNextStep.START_DONE_FOR_YOU_SETUP,
    );
    expect(result.canUsePlatform).toBe(false);
  });

  it('keeps done-for-you setup independent while it is in progress', async () => {
    organizations.findCurrent.mockResolvedValue({
      setupType: SetupType.DONE_FOR_YOU,
      setupPackageId: 'package-assisted',
    });
    setups.findActiveByOrganization.mockResolvedValue({
      _id: 'setup-1',
      status: SetupStatus.MEETING_SCHEDULED,
    });

    const result = await service.getJourney(user);

    expect(result.nextStep).toBe(
      OnboardingJourneyNextStep.CONTINUE_DONE_FOR_YOU_SETUP,
    );
  });

  it('requires subscription selection after done-for-you setup completes', async () => {
    organizations.findCurrent.mockResolvedValue({
      setupType: SetupType.DONE_FOR_YOU,
      setupPackageId: 'package-assisted',
    });
    setups.findActiveByOrganization.mockResolvedValue({
      _id: 'setup-1',
      status: SetupStatus.COMPLETED,
    });

    const result = await service.getJourney(user);

    expect(result.nextStep).toBe(
      OnboardingJourneyNextStep.SELECT_SUBSCRIPTION,
    );
  });

  it('continues to the platform after assisted setup and subscription complete', async () => {
    organizations.findCurrent.mockResolvedValue({
      setupType: SetupType.DONE_FOR_YOU,
      setupPackageId: 'package-assisted',
    });
    subscriptionAccess.getDecision.mockResolvedValue(eligibleSubscription);
    setups.findActiveByOrganization.mockResolvedValue({
      _id: 'setup-1',
      status: SetupStatus.COMPLETED,
    });

    const result = await service.getJourney(user);

    expect(result.nextStep).toBe(
      OnboardingJourneyNextStep.CONTINUE_PLATFORM,
    );
  });

  it('derives setup type from the authoritative setup-package catalog', async () => {
    setupPackages.findActiveById.mockResolvedValue({
      _id: 'package-assisted',
      setupType: SetupType.DONE_FOR_YOU,
    });
    organizations.findCurrent.mockResolvedValue({
      setupType: SetupType.DONE_FOR_YOU,
      setupPackageId: 'package-assisted',
    });
    organizations.selectSetupPath.mockResolvedValue({});
    setups.findActiveByOrganization.mockResolvedValue(null);

    await service.selectSetupPath(user, {
      setupPackageId: '507f1f77bcf86cd799439011',
    });

    expect(organizations.selectSetupPath).toHaveBeenCalledWith(
      user.organizationId,
      {
        setupType: SetupType.DONE_FOR_YOU,
        setupPackageId: 'package-assisted',
      },
      user.id,
    );
  });
});
