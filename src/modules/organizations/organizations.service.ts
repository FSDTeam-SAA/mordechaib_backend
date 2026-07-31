import { Injectable, NotFoundException } from '@nestjs/common';
import { OnboardingStep } from '../../common/enums/onboarding-step.enum';
import { UpdateOnboardingDto } from './dto/update-onboarding.dto';
import { OrganizationsRepository } from './organizations.repository';

@Injectable()
export class OrganizationsService {
  constructor(private readonly repository: OrganizationsRepository) {}

  createPendingOrganization(ownerName: string) {
    return this.repository.createPending(`${ownerName}'s Business`);
  }

  deleteOrganization(id: string) {
    return this.repository.deleteById(id);
  }

  async findCurrent(id: string) {
    const organization = await this.repository.findById(id);
    if (!organization) throw new NotFoundException('Organization not found');
    return organization;
  }

  async updateOnboarding(id: string, input: UpdateOnboardingDto) {
    const organization = await this.findCurrent(id);

    let nextStep = organization.onboardingStep;

    if (
      nextStep === OnboardingStep.COMPANY_DETAILS &&
      (input.companyName ||
        input.website ||
        input.phoneNumber ||
        input.businessHoursStart ||
        input.businessHoursEnd ||
        input.city ||
        input.street ||
        input.state ||
        input.postalCode)
    ) {
      nextStep = OnboardingStep.INDUSTRY;
    }

    if (nextStep === OnboardingStep.INDUSTRY && input.industry) {
      nextStep = OnboardingStep.BUSINESS_SIZE;
    }

    if (nextStep === OnboardingStep.BUSINESS_SIZE && input.businessSize) {
      nextStep = OnboardingStep.COMPLETED;
    }

    return this.repository.updateOnboarding(id, {
      ...input,
      ...(nextStep === OnboardingStep.COMPLETED
        ? { onboardingStep: nextStep, onboardingCompletedAt: new Date() }
        : nextStep !== organization.onboardingStep
          ? { onboardingStep: nextStep }
          : {}),
    });
  }
}
