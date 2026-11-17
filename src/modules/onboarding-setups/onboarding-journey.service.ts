import { Injectable } from '@nestjs/common';
import { SetupStatus } from '../../common/enums/setup-status.enum';
import { SetupType } from '../../common/enums/setup-type.enum';
import { RequestUser } from '../../common/types/request-context.type';
import { OrganizationsService } from '../organizations/organizations.service';
import { SetupPackagesService } from '../setup-packages/setup-packages.service';
import {
  SubscriptionAccessDecision,
  SubscriptionAccessPolicyService,
} from '../subscriptions/subscription-access-policy.service';
import { SelectSetupPathDto } from './dto/select-setup-path.dto';
import {
  OnboardingSetupLean,
  OnboardingSetupsRepository,
} from './onboarding-setups.repository';

export enum OnboardingJourneyNextStep {
  SELECT_SETUP_PATH = 'SELECT_SETUP_PATH',
  SELECT_SUBSCRIPTION = 'SELECT_SUBSCRIPTION',
  CONTINUE_SELF_SETUP = 'CONTINUE_SELF_SETUP',
  START_DONE_FOR_YOU_SETUP = 'START_DONE_FOR_YOU_SETUP',
  CONTINUE_DONE_FOR_YOU_SETUP = 'CONTINUE_DONE_FOR_YOU_SETUP',
  CONTINUE_PLATFORM = 'CONTINUE_PLATFORM',
}

/**
 * Resolves onboarding navigation without mixing one-time setup payment state
 * with the recurring product-subscription access policy.
 */
@Injectable()
export class OnboardingJourneyService {
  constructor(
    private readonly organizations: OrganizationsService,
    private readonly setupPackages: SetupPackagesService,
    private readonly subscriptionAccess: SubscriptionAccessPolicyService,
    private readonly setups: OnboardingSetupsRepository,
  ) {}

  async selectSetupPath(user: RequestUser, dto: SelectSetupPathDto) {
    const setupPackage = await this.setupPackages.findActiveById(
      dto.setupPackageId,
    );

    await this.organizations.selectSetupPath(
      user.organizationId,
      {
        setupType: setupPackage.setupType,
        setupPackageId: String(setupPackage._id),
      },
      user.id,
    );

    return this.getJourney(user);
  }

  async getJourney(user: RequestUser) {
    const [organization, subscription] = await Promise.all([
      this.organizations.findCurrent(user.organizationId),
      this.subscriptionAccess.getDecision(user.organizationId),
    ]);

    const setup = organization.setupType
      ? await this.setups.findActiveByOrganization(user.organizationId)
      : null;

    return {
      organizationId: user.organizationId,
      setupPath: organization.setupType
        ? {
            setupType: organization.setupType,
            setupPackageId: organization.setupPackageId ?? null,
            selectedAt: organization.setupPathSelectedAt ?? null,
          }
        : null,
      setup: setup
        ? {
            onboardingSetupId: String(setup._id),
            status: setup.status,
          }
        : null,
      subscription,
      canUsePlatform: subscription.canUsePlatform,
      nextStep: this.resolveNextStep(
        organization.setupType,
        setup,
        subscription,
      ),
    };
  }

  private resolveNextStep(
    setupType: SetupType | undefined,
    setup: OnboardingSetupLean | null,
    subscription: SubscriptionAccessDecision,
  ): OnboardingJourneyNextStep {
    if (!setupType) {
      return OnboardingJourneyNextStep.SELECT_SETUP_PATH;
    }

    if (setupType === SetupType.SELF_CONNECT) {
      return subscription.canUsePlatform
        ? OnboardingJourneyNextStep.CONTINUE_SELF_SETUP
        : OnboardingJourneyNextStep.SELECT_SUBSCRIPTION;
    }

    if (!setup) {
      return OnboardingJourneyNextStep.START_DONE_FOR_YOU_SETUP;
    }

    if (setup.status !== SetupStatus.COMPLETED) {
      return OnboardingJourneyNextStep.CONTINUE_DONE_FOR_YOU_SETUP;
    }

    return subscription.canUsePlatform
      ? OnboardingJourneyNextStep.CONTINUE_PLATFORM
      : OnboardingJourneyNextStep.SELECT_SUBSCRIPTION;
  }
}
