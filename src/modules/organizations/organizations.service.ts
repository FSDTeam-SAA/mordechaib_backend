import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { OnboardingStep } from '../../common/enums/onboarding-step.enum';
import { assertValidTimezone } from '../../common/helpers/timezone.helper';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { UpdateOnboardingDto } from './dto/update-onboarding.dto';
import { OrganizationsRepository } from './organizations.repository';

@Injectable()
export class OrganizationsService {
  constructor(
    private readonly repository: OrganizationsRepository,
    private readonly auditLogs: AuditLogsService,
  ) {}

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

  searchIdsByName(query: string) {
    return this.repository.searchIdsByName(query);
  }

  findByIds(ids: string[]) {
    return this.repository.findByIds(ids);
  }

  async updateSettings(
    id: string,
    input: UpdateOnboardingDto,
    updatedBy: string,
  ) {
    return this.updateOnboarding(id, input, updatedBy);
  }

  async updateOnboarding(
    id: string,
    input: UpdateOnboardingDto,
    updatedBy: string,
  ) {
    const organization = await this.findCurrent(id);

    if (typeof input.timezone === 'string') {
      assertValidTimezone(input.timezone);
    }

    if (
      input.companyName === null ||
      (typeof input.companyName === 'string' &&
        input.companyName.trim().length === 0)
    ) {
      throw new BadRequestException('companyName cannot be empty');
    }

    if (Object.values(input).every((value) => value === undefined)) {
      throw new BadRequestException('No organization changes were provided');
    }

    let nextStep = organization.onboardingStep;

    if (
      nextStep === OnboardingStep.COMPANY_DETAILS &&
      (input.companyName ||
        input.website ||
        input.phoneNumber ||
        input.emailAddress ||
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

    const updated = await this.repository.updateOnboarding(id, {
      ...input,
      updatedBy,
      ...(nextStep === OnboardingStep.COMPLETED
        ? { onboardingStep: nextStep, onboardingCompletedAt: new Date() }
        : nextStep !== organization.onboardingStep
          ? { onboardingStep: nextStep }
          : {}),
    });

    if (!updated) throw new NotFoundException('Organization not found');

    await this.auditLogs.create({
      organizationId: id,
      userId: updatedBy,
      action: 'ORGANIZATION_SETTINGS_UPDATED',
      resourceType: 'Organization',
      resourceId: id,
      metadata: {
        fields: Object.keys(input).filter(
          (field) => input[field as keyof UpdateOnboardingDto] !== undefined,
        ),
      },
    });

    return updated;
  }
}
