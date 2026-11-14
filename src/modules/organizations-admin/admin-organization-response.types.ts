import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { OrganizationStatus } from '../../common/enums/organization-status.enum';
import { PlanType } from '../../common/enums/plan-type.enum';
import { SubscriptionStatus } from '../../common/enums/subscription-status.enum';
import {
  AdminOrganizationTrendDirection,
  AdminSubscriptionDisplayStatus,
} from './admin-organization-contract';

export class AdminOrganizationComparison {
  @ApiProperty()
  current!: number;

  @ApiProperty()
  previous!: number;

  @ApiProperty()
  absoluteChange!: number;

  @ApiProperty({ type: Number, nullable: true })
  percentChange!: number | null;

  @ApiProperty({ enum: AdminOrganizationTrendDirection })
  direction!: AdminOrganizationTrendDirection;

  @ApiProperty()
  comparisonAvailable!: boolean;
}

export class AdminOrganizationListSummary {
  @ApiProperty({ format: 'date-time' })
  asOf!: string;

  @ApiProperty({ example: 'Asia/Dhaka' })
  timezone!: string;

  @ApiProperty({ example: 'POINT_IN_TIME_7_DAYS_AGO' })
  comparisonBasis!: string;

  @ApiProperty()
  totalOrganizations!: number;

  @ApiProperty()
  activeOrganizations!: number;

  @ApiProperty()
  suspendedOrganizations!: number;

  @ApiProperty()
  suspendedToday!: number;

  @ApiProperty({
    type: Object,
    description: 'Current and previous seven-day ISO-8601 boundaries.',
  })
  period!: Record<string, unknown>;

  @ApiProperty({
    type: Object,
    description:
      'Comparison objects keyed by totalOrganizations, activeOrganizations, and suspendedOrganizations.',
  })
  comparisons!: Record<string, AdminOrganizationComparison>;
}

export class AdminOrganizationOwner {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ format: 'email' })
  email!: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  avatarUrl?: string | null;
}

export class AdminOrganizationPlanSummary {
  @ApiProperty()
  id!: string;

  @ApiProperty({ enum: PlanType })
  planType!: PlanType;

  @ApiProperty()
  name!: string;

  @ApiPropertyOptional({ type: Number, nullable: true })
  priceUsd?: number | null;

  @ApiPropertyOptional({ type: Number, nullable: true })
  annualPriceUsd?: number | null;
}

export class AdminOrganizationSubscriptionSummary {
  @ApiProperty()
  id!: string;

  @ApiProperty({ enum: SubscriptionStatus })
  status!: SubscriptionStatus;

  @ApiProperty({ enum: AdminSubscriptionDisplayStatus })
  displayStatus!: AdminSubscriptionDisplayStatus;

  @ApiProperty()
  isPaused!: boolean;

  @ApiProperty({ enum: ['month', 'year'], nullable: true })
  billingInterval!: 'month' | 'year' | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  currentPeriodStart!: string | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  nextRenewal!: string | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  pausedUntil!: string | null;

  @ApiProperty()
  cancelAtPeriodEnd!: boolean;

  @ApiProperty({ type: AdminOrganizationPlanSummary, nullable: true })
  plan!: AdminOrganizationPlanSummary | null;
}

export class AdminOrganizationListItem {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ type: String, nullable: true })
  logoUrl!: string | null;

  @ApiProperty({ type: String, nullable: true })
  emailAddress!: string | null;

  @ApiProperty({ type: String, nullable: true })
  phoneNumber!: string | null;

  @ApiProperty({ type: String, nullable: true })
  businessSize!: string | null;

  @ApiProperty({ format: 'date-time' })
  joinedAt!: string;

  @ApiProperty({ enum: OrganizationStatus })
  status!: OrganizationStatus;

  @ApiProperty({ type: AdminOrganizationOwner, nullable: true })
  owner!: AdminOrganizationOwner | null;

  @ApiProperty()
  memberCount!: number;

  @ApiProperty({ type: AdminOrganizationSubscriptionSummary, nullable: true })
  subscription!: AdminOrganizationSubscriptionSummary | null;
}

export class AdminOrganizationListResponse {
  @ApiProperty({ type: AdminOrganizationListSummary })
  summary!: AdminOrganizationListSummary;

  @ApiProperty({ type: [AdminOrganizationListItem] })
  items!: AdminOrganizationListItem[];

  @ApiProperty()
  page!: number;

  @ApiProperty()
  limit!: number;

  @ApiProperty()
  total!: number;

  @ApiProperty()
  totalPages!: number;
}

export class AdminOrganizationProfile {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ type: String, nullable: true })
  logoUrl!: string | null;

  @ApiProperty({ type: String, nullable: true })
  website!: string | null;

  @ApiProperty({ type: String, nullable: true })
  industry!: string | null;

  @ApiProperty({ type: String, nullable: true })
  emailAddress!: string | null;

  @ApiProperty({ type: String, nullable: true })
  phoneNumber!: string | null;

  @ApiProperty({ type: String, nullable: true })
  businessSize!: string | null;

  @ApiProperty({ type: Object, nullable: true })
  businessHours!: Record<string, string> | null;

  @ApiProperty()
  language!: string;

  @ApiProperty()
  timezone!: string;

  @ApiProperty({ type: Object, nullable: true })
  address!: Record<string, string> | null;

  @ApiProperty({ enum: OrganizationStatus })
  status!: OrganizationStatus;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  suspendedAt!: string | null;

  @ApiProperty({ type: String, nullable: true })
  suspendedReason!: string | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  createdAt!: string | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  onboardingCompletedAt!: string | null;
}

export class AdminOrganizationMetric {
  @ApiProperty({ enum: ['AVAILABLE'] })
  availability!: 'AVAILABLE';

  @ApiProperty()
  value!: number;

  @ApiPropertyOptional()
  scope?: string;

  @ApiPropertyOptional()
  source?: string;
}

export class AdminOrganizationMetrics {
  @ApiProperty({ type: AdminOrganizationMetric })
  tasksCreated!: AdminOrganizationMetric;

  @ApiProperty({ type: AdminOrganizationMetric })
  meetings!: AdminOrganizationMetric;

  @ApiProperty({ type: AdminOrganizationMetric })
  crmContacts!: AdminOrganizationMetric;

  @ApiProperty({ type: AdminOrganizationMetric })
  roiReports!: AdminOrganizationMetric;
}

export class AdminConnectedToolAccount {
  @ApiPropertyOptional()
  id?: string;

  @ApiPropertyOptional()
  email?: string;

  @ApiPropertyOptional()
  name?: string;

  @ApiPropertyOptional()
  phoneNumber?: string;
}

export class AdminConnectedTool {
  @ApiProperty()
  provider!: string;

  @ApiProperty()
  label!: string;

  @ApiProperty()
  connected!: boolean;

  @ApiProperty()
  status!: string;

  @ApiProperty()
  canManage!: false;

  @ApiPropertyOptional()
  isDefault?: boolean;

  @ApiPropertyOptional()
  isDefaultCrm?: boolean;

  @ApiPropertyOptional()
  connectedAccounts?: number;

  @ApiPropertyOptional({ type: AdminConnectedToolAccount })
  account?: AdminConnectedToolAccount;

  @ApiPropertyOptional()
  connectedByUserId?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  expiresAt?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  lastSyncedAt?: string;

  @ApiPropertyOptional()
  syncStatus?: string;

  @ApiPropertyOptional()
  reconnectRequired?: boolean;
}

export class AdminConnectedToolsSummary {
  @ApiProperty()
  total!: number;

  @ApiProperty()
  connected!: number;

  @ApiProperty()
  attentionRequired!: number;

  @ApiProperty()
  notConfigured!: number;
}

export class AdminConnectedToolsOverview {
  @ApiProperty()
  organizationId!: string;

  @ApiProperty({ type: AdminConnectedToolsSummary })
  summary!: AdminConnectedToolsSummary;

  @ApiProperty({ type: [AdminConnectedTool] })
  items!: AdminConnectedTool[];
}

export class AdminOrganizationOperationResult {
  @ApiProperty({ enum: ['STATUS_UPDATE', 'PLAN_CHANGE'] })
  type!: 'STATUS_UPDATE' | 'PLAN_CHANGE';

  @ApiProperty()
  changed!: boolean;

  @ApiProperty()
  duplicate!: boolean;
}

export class AdminOrganizationDetailResponse {
  @ApiProperty({ type: AdminOrganizationProfile })
  organization!: AdminOrganizationProfile;

  @ApiProperty({ type: AdminOrganizationOwner, nullable: true })
  owner!: AdminOrganizationOwner | null;

  @ApiProperty()
  memberCount!: number;

  @ApiProperty({ type: AdminOrganizationSubscriptionSummary, nullable: true })
  subscription!: AdminOrganizationSubscriptionSummary | null;

  @ApiProperty({ type: AdminOrganizationMetrics })
  metrics!: AdminOrganizationMetrics;

  @ApiProperty({ type: AdminConnectedToolsOverview })
  connectedTools!: AdminConnectedToolsOverview;

  @ApiPropertyOptional({ type: AdminOrganizationOperationResult })
  operation?: AdminOrganizationOperationResult;
}
