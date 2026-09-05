import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { OnboardingStep } from '../../common/enums/onboarding-step.enum';
import { Organization } from '../../database/schemas/organization.schema';
import { UpdateOnboardingDto } from './dto/update-onboarding.dto';

type UpdateOnboardingInput = UpdateOnboardingDto & {
  onboardingStep?: OnboardingStep;
  onboardingCompletedAt?: Date;
  updatedBy?: string;
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
    const $set: Record<string, unknown> = {};
    const $unset: Record<string, 1> = {};

    const setOrUnset = (path: string, value: unknown) => {
      if (value === undefined) return;
      if (value === null) {
        $unset[path] = 1;
        return;
      }
      $set[path] = value;
    };

    if (input.companyName !== undefined && input.companyName !== null) {
      $set.name = input.companyName;
    }
    setOrUnset('website', input.website);
    setOrUnset('phoneNumber', input.phoneNumber);
    setOrUnset('emailAddress', input.emailAddress);
    setOrUnset('timezone', input.timezone);
    setOrUnset('language', input.language);
    setOrUnset('logoUrl', input.logoUrl);
    setOrUnset('businessHours.start', input.businessHoursStart);
    setOrUnset('businessHours.end', input.businessHoursEnd);
    setOrUnset('address.city', input.city);
    setOrUnset('address.street', input.street);
    setOrUnset('address.state', input.state);
    setOrUnset('address.postalCode', input.postalCode);
    setOrUnset('industry', input.industry);
    setOrUnset('businessSize', input.businessSize);
    setOrUnset('onboardingStep', input.onboardingStep);
    setOrUnset('onboardingCompletedAt', input.onboardingCompletedAt);
    setOrUnset('updatedBy', input.updatedBy);

    return this.organizationModel
      .findByIdAndUpdate(
        id,
        {
          ...(Object.keys($set).length > 0 ? { $set } : {}),
          ...(Object.keys($unset).length > 0 ? { $unset } : {}),
        },
        { new: true, runValidators: true },
      )
      .lean()
      .exec();
  }
}
