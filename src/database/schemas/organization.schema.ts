import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { BusinessIndustry } from '../../common/enums/business-industry.enum';
import { BusinessSize } from '../../common/enums/business-size.enum';
import { OnboardingStep } from '../../common/enums/onboarding-step.enum';

export type OrganizationDocument = HydratedDocument<Organization>;

@Schema({ timestamps: true, collection: 'organizations' })
export class Organization {
  @Prop({ required: true, trim: true })
  name!: string;

  @Prop({ default: 'UTC' })
  timezone!: string;

  @Prop({ default: 'ACTIVE' })
  status!: string;

  @Prop({ default: 'STARTER' })
  plan!: string;

  @Prop({ trim: true })
  website?: string;

  @Prop({ trim: true })
  phoneNumber?: string;

  @Prop({ lowercase: true, trim: true })
  emailAddress?: string;

  @Prop({ trim: true, default: 'en' })
  language!: string;

  @Prop({ trim: true })
  logoUrl?: string;

  @Prop({ type: { start: String, end: String }, _id: false })
  businessHours?: {
    start: string;
    end: string;
  };

  @Prop({
    type: {
      city: String,
      street: String,
      state: String,
      postalCode: String,
    },
    _id: false,
  })
  address?: {
    city: string;
    street: string;
    state: string;
    postalCode: string;
  };

  @Prop({ enum: Object.values(BusinessIndustry) })
  industry?: BusinessIndustry;

  @Prop({ enum: Object.values(BusinessSize) })
  businessSize?: BusinessSize;

  @Prop({
    default: OnboardingStep.COMPANY_DETAILS,
    enum: Object.values(OnboardingStep),
    index: true,
  })
  onboardingStep!: OnboardingStep;

  @Prop()
  onboardingCompletedAt?: Date;

  @Prop()
  updatedBy?: string;
}

export const OrganizationSchema = SchemaFactory.createForClass(Organization);
