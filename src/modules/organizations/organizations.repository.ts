import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { BusinessIndustry } from '../../common/enums/business-industry.enum';
import { BusinessSize } from '../../common/enums/business-size.enum';
import { OnboardingStep } from '../../common/enums/onboarding-step.enum';
import { Organization } from '../../database/schemas/organization.schema';
import { UpdateCompanyDetailsDto } from './dto/update-company-details.dto';

@Injectable()
export class OrganizationsRepository {
  constructor(
    @InjectModel(Organization.name)
    private readonly organizationModel: Model<Organization>,
  ) {}

  createPending(name: string) {
    return this.organizationModel.create({
      name,
      status: 'ACTIVE',
      onboardingStep: OnboardingStep.COMPANY_DETAILS,
    });
  }

  findById(id: string) {
    return this.organizationModel.findById(id).lean().exec();
  }

  deleteById(id: string) {
    return this.organizationModel.findByIdAndDelete(id).exec();
  }

  updateCompanyDetails(
    id: string,
    input: UpdateCompanyDetailsDto,
    onboardingStep: OnboardingStep,
  ) {
    return this.organizationModel
      .findByIdAndUpdate(
        id,
        {
          name: input.companyName,
          website: input.website,
          phoneNumber: input.phoneNumber,
          businessHours: {
            start: input.businessHoursStart,
            end: input.businessHoursEnd,
          },
          address: {
            city: input.city,
            street: input.street,
            state: input.state,
            postalCode: input.postalCode,
          },
          onboardingStep,
        },
        { new: true },
      )
      .lean()
      .exec();
  }

  updateIndustry(
    id: string,
    industry: BusinessIndustry,
    onboardingStep: OnboardingStep,
  ) {
    return this.organizationModel
      .findByIdAndUpdate(id, { industry, onboardingStep }, { new: true })
      .lean()
      .exec();
  }

  updateBusinessSize(id: string, businessSize: BusinessSize) {
    return this.organizationModel
      .findByIdAndUpdate(
        id,
        {
          businessSize,
          onboardingStep: OnboardingStep.COMPLETED,
          onboardingCompletedAt: new Date(),
        },
        { new: true },
      )
      .lean()
      .exec();
  }
}
