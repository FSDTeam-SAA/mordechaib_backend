import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { OnboardingStep } from '../../common/enums/onboarding-step.enum';
import { assertValidTimezone } from '../../common/helpers/timezone.helper';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { UpdateOnboardingDto } from './dto/update-onboarding.dto';
import { OrganizationLogoStorageService } from './organization-logo-storage.service';
import { OrganizationsRepository } from './organizations.repository';

type OrganizationBrandingFiles = {
  logo?: Express.Multer.File;
  favicon?: Express.Multer.File;
};

@Injectable()
export class OrganizationsService {
  constructor(
    private readonly repository: OrganizationsRepository,
    private readonly auditLogs: AuditLogsService,
    private readonly organizationLogoStorage: OrganizationLogoStorageService,
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
    branding?: OrganizationBrandingFiles,
  ) {
    return this.updateOnboarding(id, input, updatedBy, branding);
  }

  async updateOnboarding(
    id: string,
    input: UpdateOnboardingDto,
    updatedBy: string,
    branding?: OrganizationBrandingFiles,
  ) {
    const organization = await this.findCurrent(id);
    const changes = input;
    const { logo, favicon } = branding ?? {};

    if (logo && changes.logoUrl !== undefined) {
      throw new BadRequestException('Send either logo or logoUrl, not both');
    }
    if (favicon && changes.faviconUrl !== undefined) {
      throw new BadRequestException(
        'Send either favicon or faviconUrl, not both',
      );
    }

    if (typeof changes.timezone === 'string') {
      assertValidTimezone(changes.timezone);
    }

    if (
      changes.companyName === null ||
      (typeof changes.companyName === 'string' &&
        changes.companyName.trim().length === 0)
    ) {
      throw new BadRequestException('companyName cannot be empty');
    }

    if (
      !logo &&
      !favicon &&
      Object.values(changes).every((value) => value === undefined)
    ) {
      throw new BadRequestException('No organization changes were provided');
    }

    const resolvedInput = {
      ...changes,
      ...(logo
        ? { logoUrl: await this.organizationLogoStorage.upload(id, logo) }
        : {}),
      ...(favicon
        ? {
            faviconUrl: await this.organizationLogoStorage.uploadFavicon(
              id,
              favicon,
            ),
          }
        : {}),
    };

    let nextStep = organization.onboardingStep;

    if (
      nextStep === OnboardingStep.COMPANY_DETAILS &&
      (changes.companyName ||
        changes.website ||
        changes.phoneNumber ||
        changes.emailAddress ||
        changes.businessHoursStart ||
        changes.businessHoursEnd ||
        changes.city ||
        changes.street ||
        changes.state ||
        changes.postalCode)
    ) {
      nextStep = OnboardingStep.INDUSTRY;
    }

    if (nextStep === OnboardingStep.INDUSTRY && changes.industry) {
      nextStep = OnboardingStep.BUSINESS_SIZE;
    }

    if (nextStep === OnboardingStep.BUSINESS_SIZE && changes.businessSize) {
      nextStep = OnboardingStep.COMPLETED;
    }

    const updated = await this.repository.updateOnboarding(
      id,
      {
        ...resolvedInput,
        updatedBy,
        ...(nextStep === OnboardingStep.COMPLETED
          ? { onboardingStep: nextStep, onboardingCompletedAt: new Date() }
          : nextStep !== organization.onboardingStep
            ? { onboardingStep: nextStep }
            : {}),
      },
    );

    if (!updated) {
      throw new NotFoundException('Organization not found');
    }

    await this.auditLogs.create({
      organizationId: id,
      userId: updatedBy,
      action: 'ORGANIZATION_SETTINGS_UPDATED',
      resourceType: 'Organization',
      resourceId: id,
      metadata: {
        fields: Object.keys(resolvedInput).filter(
          (field) =>
            resolvedInput[field as keyof typeof resolvedInput] !== undefined,
        ),
      },
    });

    return updated;
  }
}
