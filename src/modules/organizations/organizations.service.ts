import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { BusinessIndustry } from '../../common/enums/business-industry.enum';
import { BusinessSize } from '../../common/enums/business-size.enum';
import { OnboardingStep } from '../../common/enums/onboarding-step.enum';
import { UpdateCompanyDetailsDto } from './dto/update-company-details.dto';
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

  async updateCompanyDetails(id: string, input: UpdateCompanyDetailsDto) {
    const organization = await this.findCurrent(id);
    const nextStep =
      organization.onboardingStep === OnboardingStep.COMPANY_DETAILS
        ? OnboardingStep.INDUSTRY
        : organization.onboardingStep;

    return this.repository.updateCompanyDetails(id, input, nextStep);
  }

  async updateIndustry(id: string, industry: BusinessIndustry) {
    const organization = await this.findCurrent(id);
    if (organization.onboardingStep === OnboardingStep.COMPANY_DETAILS) {
      throw new BadRequestException(
        'Complete company details before selecting an industry',
      );
    }

    const nextStep =
      organization.onboardingStep === OnboardingStep.INDUSTRY
        ? OnboardingStep.BUSINESS_SIZE
        : organization.onboardingStep;

    return this.repository.updateIndustry(id, industry, nextStep);
  }

  async updateBusinessSize(id: string, businessSize: BusinessSize) {
    const organization = await this.findCurrent(id);
    if (!organization.industry) {
      throw new BadRequestException(
        'Select an industry before completing business size',
      );
    }

    return this.repository.updateBusinessSize(id, businessSize);
  }
}
