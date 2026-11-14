import { ApiProperty } from '@nestjs/swagger';
import { OrganizationStatus } from '../../common/enums/organization-status.enum';
import { PlanType } from '../../common/enums/plan-type.enum';
import { SubscriptionStatus } from '../../common/enums/subscription-status.enum';
import {
  AdminPlanOptionAction,
  AdminSubscriptionDisplayStatus,
} from './admin-organization-contract';

export class AdminOrganizationPlanOption {
  @ApiProperty()
  id!: string;

  @ApiProperty({ enum: PlanType })
  planType!: PlanType;

  @ApiProperty()
  name!: string;

  @ApiProperty({ type: String, nullable: true })
  tagline!: string | null;

  @ApiProperty({ type: [String], enum: ['month', 'year'] })
  billingCycles!: ('month' | 'year')[];

  @ApiProperty({ type: Number, nullable: true })
  monthlyPriceUsd!: number | null;

  @ApiProperty({ type: Number, nullable: true })
  annualPriceUsd!: number | null;

  @ApiProperty({ type: Number, nullable: true })
  selectedPriceUsd!: number | null;

  @ApiProperty({ type: [String] })
  features!: string[];

  @ApiProperty({ type: Number, nullable: true })
  aiActionsPerMonth!: number | null;

  @ApiProperty({ type: Number, nullable: true })
  crmContactsLimit!: number | null;

  @ApiProperty({ type: Number, nullable: true })
  callMinutesPerMonth!: number | null;

  @ApiProperty({ type: Number, nullable: true })
  meetingHoursPerMonth!: number | null;

  @ApiProperty({ type: Number, nullable: true })
  usersIncluded!: number | null;

  @ApiProperty({ type: Number, nullable: true })
  aiAgentsIncluded!: number | null;

  @ApiProperty({ type: Number, nullable: true })
  extraAiActionPriceUsd!: number | null;

  @ApiProperty({ type: Number, nullable: true })
  extraCallMinutePriceUsd!: number | null;

  @ApiProperty()
  customizationIncluded!: boolean;

  @ApiProperty()
  isMostPopular!: boolean;

  @ApiProperty()
  isInquiryOnly!: boolean;

  @ApiProperty()
  isCurrent!: boolean;

  @ApiProperty()
  supportsSelectedBillingInterval!: boolean;

  @ApiProperty({ enum: AdminPlanOptionAction })
  action!: AdminPlanOptionAction;

  @ApiProperty()
  canExecute!: boolean;
}

export class AdminOrganizationPlanOptionsResponse {
  @ApiProperty()
  organizationId!: string;

  @ApiProperty()
  organizationName!: string;

  @ApiProperty({ enum: OrganizationStatus })
  organizationStatus!: OrganizationStatus;

  @ApiProperty({ enum: ['month', 'year'] })
  selectedBillingInterval!: 'month' | 'year';

  @ApiProperty({ type: String, nullable: true })
  currentPlanId!: string | null;

  @ApiProperty({ enum: SubscriptionStatus, nullable: true })
  subscriptionStatus!: SubscriptionStatus | null;

  @ApiProperty({
    enum: AdminSubscriptionDisplayStatus,
    nullable: true,
  })
  subscriptionDisplayStatus!: AdminSubscriptionDisplayStatus | null;

  @ApiProperty()
  hasManageableStripeSubscription!: boolean;

  @ApiProperty({ type: [AdminOrganizationPlanOption] })
  options!: AdminOrganizationPlanOption[];
}
