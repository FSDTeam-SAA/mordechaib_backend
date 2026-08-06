import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { OnboardingStep } from '../../common/enums/onboarding-step.enum';
import { Organization } from '../../database/schemas/organization.schema';
import { UpdateOnboardingDto } from './dto/update-onboarding.dto';

type UpdateOnboardingInput = UpdateOnboardingDto & {
  onboardingStep?: OnboardingStep;
  onboardingCompletedAt?: Date;
};

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

  async searchIdsByName(query: string): Promise<string[]> {
    const orgs = await this.organizationModel
      .find({ name: { $regex: query, $options: 'i' } })
      .select('_id')
      .lean()
      .exec();
    return orgs.map((org) => String(org._id));
  }

  findByIds(ids: string[]) {
    return this.organizationModel
      .find({ _id: { $in: ids } })
      .select('name')
      .lean()
      .exec();
  }

  deleteById(id: string) {
    return this.organizationModel.findByIdAndDelete(id).exec();
  }

  updateOnboarding(id: string, input: UpdateOnboardingInput) {
    const update: Record<string, unknown> = {
      ...(input.companyName ? { name: input.companyName } : {}),
      ...(input.website ? { website: input.website } : {}),
      ...(input.phoneNumber ? { phoneNumber: input.phoneNumber } : {}),
      ...(input.businessHoursStart || input.businessHoursEnd
        ? {
            businessHours: {
              ...(input.businessHoursStart
                ? { start: input.businessHoursStart }
                : {}),
              ...(input.businessHoursEnd
                ? { end: input.businessHoursEnd }
                : {}),
            },
          }
        : {}),
      ...(input.city || input.street || input.state || input.postalCode
        ? {
            address: {
              ...(input.city ? { city: input.city } : {}),
              ...(input.street ? { street: input.street } : {}),
              ...(input.state ? { state: input.state } : {}),
              ...(input.postalCode ? { postalCode: input.postalCode } : {}),
            },
          }
        : {}),
      ...(input.industry ? { industry: input.industry } : {}),
      ...(input.businessSize ? { businessSize: input.businessSize } : {}),
      ...(input.onboardingStep ? { onboardingStep: input.onboardingStep } : {}),
      ...(input.onboardingCompletedAt
        ? { onboardingCompletedAt: input.onboardingCompletedAt }
        : {}),
    };

    return this.organizationModel
      .findByIdAndUpdate(id, update, { new: true })
      .lean()
      .exec();
  }
}