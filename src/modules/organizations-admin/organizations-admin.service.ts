import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import crypto from 'node:crypto';
import { Model, PipelineStage } from 'mongoose';
import { AUDIT_ACTION } from '../../common/constants/audit-action.constants';
import { CustomerContactStatus } from '../../common/enums/customer-contact-status.enum';
import { OrganizationStatus } from '../../common/enums/organization-status.enum';
import { SubscriptionStatus } from '../../common/enums/subscription-status.enum';
import { UserRole } from '../../common/enums/user-role.enum';
import { localDayRange } from '../../common/helpers/local-date-range.helper';
import { RequestUser } from '../../common/types/request-context.type';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { IntegrationsService } from '../integrations/integrations.service';
import { PlatformOperationLeasesService } from '../platform-operation-leases/platform-operation-leases.service';
import { StripeProvider } from '../stripe/stripe.provider';
import { SubscriptionPlansService } from '../subscriptions/subscription-plans.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { ManagedCalendarEvent } from '../../database/schemas/managed-calendar-event.schema';
import { CustomerContact } from '../../database/schemas/customer-contact.schema';
import { Organization } from '../../database/schemas/organization.schema';
import { OrganizationSubscription } from '../../database/schemas/organization-subscription.schema';
import { PlatformMeeting } from '../../database/schemas/platform-meeting.schema';
import { TaskItem } from '../../database/schemas/task-item.schema';
import { User } from '../../database/schemas/user.schema';
import {
  AdminSubscriptionDisplayStatus,
  buildAdminOrganizationSummary,
  buildAdminPlanOption,
  canManageStripeSubscription,
  presentAdminSubscription,
} from './admin-organization-contract';
import { ChangeOrganizationPlanDto } from './dto/change-organization-plan.dto';
import { ListOrganizationPlanOptionsQueryDto } from './dto/list-organization-plan-options-query.dto';
import { ListOrganizationsAdminQueryDto } from './dto/list-organizations-admin-query.dto';
import { UpdateOrganizationStatusDto } from './dto/update-organization-status.dto';

const PLATFORM_ORGANIZATION_NAME = 'Noltra Platform Team';

@Injectable()
export class OrganizationsAdminService {
  private readonly logger = new Logger(OrganizationsAdminService.name);

  constructor(
    @InjectModel(Organization.name)
    private readonly organizations: Model<Organization>,
    @InjectModel(User.name) private readonly users: Model<User>,
    @InjectModel(OrganizationSubscription.name)
    private readonly subscriptions: Model<OrganizationSubscription>,
    @InjectModel(TaskItem.name) private readonly tasks: Model<TaskItem>,
    @InjectModel(PlatformMeeting.name)
    private readonly platformMeetings: Model<PlatformMeeting>,
    @InjectModel(ManagedCalendarEvent.name)
    private readonly calendarEvents: Model<ManagedCalendarEvent>,
    @InjectModel(CustomerContact.name)
    private readonly customerContacts: Model<CustomerContact>,
    private readonly plans: SubscriptionPlansService,
    private readonly subscriptionsService: SubscriptionsService,
    private readonly stripe: StripeProvider,
    private readonly integrations: IntegrationsService,
    private readonly operationLeases: PlatformOperationLeasesService,
    private readonly audits: AuditLogsService,
  ) {}

  async list(query: ListOrganizationsAdminQueryDto) {
    if (query.subscriptionStatus && query.subscriptionDisplayStatus) {
      throw new BadRequestException(
        'Use either subscriptionStatus or subscriptionDisplayStatus, not both',
      );
    }
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const asOf = new Date();
    const baseMatch = this.baseMatch();
    const pipeline = [
      { $match: baseMatch },
      {
        $lookup: {
          from: 'users',
          let: { organizationId: { $toString: '$_id' } },
          pipeline: [
            {
              $match: {
                $expr: { $eq: ['$organizationId', '$$organizationId'] },
              },
            },
            { $sort: { role: 1, createdAt: 1 } },
          ],
          as: 'members',
        },
      },
      {
        $lookup: {
          from: 'organization_subscriptions',
          let: { organizationId: { $toString: '$_id' } },
          pipeline: [
            {
              $match: {
                $expr: { $eq: ['$organizationId', '$$organizationId'] },
              },
            },
            { $limit: 1 },
          ],
          as: 'subscriptions',
        },
      },
      { $set: { subscription: { $arrayElemAt: ['$subscriptions', 0] } } },
      {
        $lookup: {
          from: 'subscription_plans',
          let: { planId: '$subscription.planId' },
          pipeline: [
            { $match: { $expr: { $eq: [{ $toString: '$_id' }, '$$planId'] } } },
            { $limit: 1 },
          ],
          as: 'plans',
        },
      },
      { $set: { plan: { $arrayElemAt: ['$plans', 0] } } },
      ...this.listFilters(query, asOf),
      { $sort: { createdAt: -1, _id: -1 } },
      {
        $facet: {
          items: [
            { $skip: (page - 1) * limit },
            { $limit: limit },
            {
              $project: {
                _id: 0,
                id: { $toString: '$_id' },
                name: 1,
                logoUrl: 1,
                emailAddress: 1,
                phoneNumber: 1,
                businessSize: 1,
                joinedAt: '$createdAt',
                status: 1,
                owner: {
                  $let: {
                    vars: {
                      owner: {
                        $arrayElemAt: [
                          {
                            $filter: {
                              input: '$members',
                              as: 'member',
                              cond: { $eq: ['$$member.role', UserRole.OWNER] },
                            },
                          },
                          0,
                        ],
                      },
                    },
                    in: {
                      id: { $toString: '$$owner._id' },
                      name: {
                        $concat: ['$$owner.firstName', ' ', '$$owner.lastName'],
                      },
                      email: '$$owner.email',
                    },
                  },
                },
                memberCount: { $size: '$members' },
                subscription: {
                  id: { $toString: '$subscription._id' },
                  status: '$subscription.status',
                  billingInterval: '$subscription.billingInterval',
                  nextRenewal: '$subscription.currentPeriodEnd',
                  pausedUntil: '$subscription.pausedUntil',
                  plan: {
                    id: { $toString: '$plan._id' },
                    planType: '$plan.planType',
                    name: '$plan.name',
                  },
                },
              },
            },
          ],
          total: [{ $count: 'count' }],
        },
      },
    ];

    const [results, summary] = await Promise.all([
      this.organizations.aggregate<{
        items: Record<string, unknown>[];
        total: { count: number }[];
      }>(pipeline as PipelineStage[]),
      this.summary(baseMatch, asOf, query.timezone ?? 'UTC'),
    ]);
    const result = results[0];
    const total = result?.total[0]?.count ?? 0;

    return {
      summary,
      items: (result?.items ?? []).map((item) => ({
        ...item,
        subscription: this.presentSubscription(item.subscription),
      })),
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getById(id: string) {
    const organization = await this.requireExternalOrganization(id);

    const organizationId = String(organization._id);
    const [
      members,
      subscription,
      taskCount,
      platformMeetings,
      calendarEvents,
      customerContactCount,
      roiReportCount,
    ] = await Promise.all([
      this.users
        .find({ organizationId })
        .select('firstName lastName email role avatarUrl createdAt')
        .sort({ role: 1, createdAt: 1 })
        .lean()
        .exec(),
      this.subscriptions.findOne({ organizationId }).lean().exec(),
      this.tasks.countDocuments({ organizationId }).exec(),
      this.platformMeetings
        .find({ organizationId })
        .select('calendarProvider calendarEventId')
        .lean()
        .exec(),
      this.calendarEvents
        .find({ organizationId })
        .select('provider providerEventId')
        .lean()
        .exec(),
      this.customerContacts
        .countDocuments({
          organizationId,
          status: CustomerContactStatus.ACTIVE,
        })
        .exec(),
      this.audits.countByOrganizationAndAction(
        organizationId,
        AUDIT_ACTION.ROI_REPORT_GENERATED,
      ),
    ]);
    const owner =
      members.find((member) => member.role === UserRole.OWNER) ?? members[0];
    const [plan, connectedTools] = await Promise.all([
      subscription
        ? this.plans.findById(subscription.planId)
        : Promise.resolve(null),
      this.integrations.findOrganizationOverview(organizationId),
    ]);

    const meetingKeys = new Set<string>();
    for (const meeting of platformMeetings) {
      meetingKeys.add(
        meeting.calendarEventId
          ? `${meeting.calendarProvider ?? 'CALENDAR'}:${meeting.calendarEventId}`
          : `PLATFORM:${String(meeting._id)}`,
      );
    }
    for (const event of calendarEvents) {
      meetingKeys.add(
        event.providerEventId
          ? `${event.provider}:${event.providerEventId}`
          : `CALENDAR:${String(event._id)}`,
      );
    }

    return {
      organization: {
        id: organizationId,
        name: organization.name,
        logoUrl: organization.logoUrl ?? null,
        website: organization.website ?? null,
        industry: organization.industry ?? null,
        emailAddress: organization.emailAddress ?? null,
        phoneNumber: organization.phoneNumber ?? null,
        businessSize: organization.businessSize ?? null,
        businessHours: organization.businessHours ?? null,
        language: organization.language,
        timezone: organization.timezone,
        address: organization.address ?? null,
        status: organization.status,
        suspendedAt: organization.suspendedAt ?? null,
        suspendedReason: organization.suspendedReason ?? null,
        createdAt: organization.createdAt,
        onboardingCompletedAt: organization.onboardingCompletedAt ?? null,
      },
      owner: owner
        ? {
            id: String(owner._id),
            name: `${owner.firstName} ${owner.lastName}`,
            email: owner.email,
            avatarUrl: owner.avatarUrl ?? null,
          }
        : null,
      memberCount: members.length,
      subscription: subscription
        ? presentAdminSubscription({
            id: String(subscription._id),
            status: subscription.status,
            billingInterval: subscription.billingInterval ?? null,
            currentPeriodStart: subscription.currentPeriodStart ?? null,
            nextRenewal: subscription.currentPeriodEnd ?? null,
            pausedUntil: subscription.pausedUntil ?? null,
            cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
            plan: plan
              ? {
                  id: String(plan._id),
                  planType: plan.planType,
                  name: plan.name,
                  priceUsd: plan.priceUsd ?? null,
                  annualPriceUsd: plan.annualPriceUsd ?? null,
                  billingCycles: plan.billingCycles ?? ['month'],
                }
              : null,
          })
        : null,
      metrics: {
        tasksCreated: { availability: 'AVAILABLE', value: taskCount },
        meetings: { availability: 'AVAILABLE', value: meetingKeys.size },
        crmContacts: {
          availability: 'AVAILABLE',
          value: customerContactCount,
          scope: 'ACTIVE_CUSTOMER_CONTACTS',
          source: 'NOLTRA_CUSTOMER_CONTACTS',
        },
        roiReports: {
          availability: 'AVAILABLE',
          value: roiReportCount,
          scope: 'GENERATED_PDF_REPORTS',
          source: 'AUDIT_LOG',
        },
      },
      connectedTools,
    };
  }

  async getPlanOptions(id: string, query: ListOrganizationPlanOptionsQueryDto) {
    const organization = await this.requireExternalOrganization(id);
    const subscription = await this.subscriptions
      .findOne({ organizationId: id })
      .lean()
      .exec();
    const selectedBillingInterval =
      query.billingInterval ??
      (subscription?.billingInterval === 'year' ? 'year' : 'month');
    const plans = await this.plans.findAll(false);
    const currentPlanId = subscription?.planId ?? null;
    const hasManageableSubscription = canManageStripeSubscription({
      status: subscription?.status,
      stripeSubscriptionId: subscription?.stripeSubscriptionId,
    });
    const currentDisplayStatus = subscription
      ? presentAdminSubscription(subscription).displayStatus
      : null;

    return {
      organizationId: String(organization._id),
      organizationName: organization.name,
      organizationStatus: organization.status,
      selectedBillingInterval,
      currentPlanId,
      subscriptionStatus: subscription?.status ?? null,
      subscriptionDisplayStatus: currentDisplayStatus,
      hasManageableStripeSubscription: hasManageableSubscription,
      options: plans.map((plan) =>
        buildAdminPlanOption(
          {
            id: String(plan._id),
            planType: plan.planType,
            name: plan.name,
            tagline: plan.tagline,
            billingCycles: plan.billingCycles,
            priceUsd: plan.priceUsd,
            annualPriceUsd: plan.annualPriceUsd,
            features: plan.features,
            aiActionsPerMonth: plan.aiActionsPerMonth,
            crmContactsLimit: plan.crmContactsLimit,
            callMinutesPerMonth: plan.callMinutesPerMonth,
            meetingHoursPerMonth: plan.meetingHoursPerMonth,
            usersIncluded: plan.usersIncluded,
            aiAgentsIncluded: plan.aiAgentsIncluded,
            extraAiActionPriceUsd: plan.extraAiActionPriceUsd,
            extraCallMinutePriceUsd: plan.extraCallMinutePriceUsd,
            customizationIncluded: plan.customizationIncluded,
            isMostPopular: plan.isMostPopular,
            isInquiryOnly: plan.isInquiryOnly,
          },
          {
            selectedBillingInterval,
            currentPlanId,
            currentBillingInterval:
              subscription?.billingInterval === 'year' ? 'year' : 'month',
            hasManageableStripeSubscription: hasManageableSubscription,
          },
        ),
      ),
    };
  }

  async updateStatus(
    id: string,
    dto: UpdateOrganizationStatusDto,
    actor: RequestUser,
  ) {
    return this.operationLeases.runExclusive({
      scope: 'organization-administration',
      resourceId: id,
      operation: 'UPDATE_STATUS',
      actorUserId: actor.id,
      execute: async () => {
        const organization = await this.requireExternalOrganization(id);
        if (organization.status === dto.status) {
          return this.organizationActionResult(id, {
            type: 'STATUS_UPDATE',
            changed: false,
            duplicate: true,
          });
        }
        const reason = dto.reason?.trim();
        const update =
          dto.status === OrganizationStatus.SUSPENDED
            ? {
                $set: {
                  status: dto.status,
                  suspendedAt: new Date(),
                  suspendedBy: actor.id,
                  ...(reason ? { suspendedReason: reason } : {}),
                },
                ...(!reason ? { $unset: { suspendedReason: 1 } } : {}),
              }
            : {
                $set: { status: OrganizationStatus.ACTIVE },
                $unset: {
                  suspendedAt: 1,
                  suspendedBy: 1,
                  suspendedReason: 1,
                },
              };
        await this.organizations
          .findByIdAndUpdate(id, update, { runValidators: true })
          .exec();
        await this.audits.create({
          organizationId: id,
          userId: actor.id,
          action:
            dto.status === OrganizationStatus.SUSPENDED
              ? AUDIT_ACTION.ORGANIZATION_SUSPENDED_BY_PLATFORM_ADMIN
              : AUDIT_ACTION.ORGANIZATION_RESUMED_BY_PLATFORM_ADMIN,
          resourceType: 'Organization',
          resourceId: id,
          metadata: {
            previousStatus: organization.status,
            status: dto.status,
            ...(reason ? { reason } : {}),
          },
        });
        return this.organizationActionResult(id, {
          type: 'STATUS_UPDATE',
          changed: true,
          duplicate: false,
        });
      },
    });
  }

  async changePlan(
    id: string,
    dto: ChangeOrganizationPlanDto,
    actor: RequestUser,
  ) {
    return this.operationLeases.runExclusive({
      scope: 'organization-administration',
      resourceId: id,
      operation: 'CHANGE_PLAN',
      actorUserId: actor.id,
      execute: async () => {
        await this.requireExternalOrganization(id);
        const subscription = await this.subscriptions
          .findOne({ organizationId: id })
          .lean()
          .exec();
        if (
          !subscription ||
          !canManageStripeSubscription({
            status: subscription.status,
            stripeSubscriptionId: subscription.stripeSubscriptionId,
          })
        ) {
          throw new BadRequestException(
            'This organization has no manageable Stripe subscription. Use its checkout flow before changing plans.',
          );
        }
        if (
          subscription.planId === dto.planId &&
          (subscription.billingInterval ?? 'month') === dto.billingInterval
        ) {
          return this.organizationActionResult(id, {
            type: 'PLAN_CHANGE',
            changed: false,
            duplicate: true,
          });
        }

        const plan = await this.plans.findById(dto.planId);
        if (plan.isInquiryOnly) {
          throw new BadRequestException(
            'Inquiry-only plans cannot be assigned directly',
          );
        }
        const supportedBillingCycles = plan.billingCycles?.length
          ? plan.billingCycles
          : ['month'];
        if (!supportedBillingCycles.includes(dto.billingInterval)) {
          throw new BadRequestException(
            `The selected plan does not support ${dto.billingInterval} billing`,
          );
        }
        const priceId = await this.plans.ensureCheckoutPrice(
          dto.planId,
          dto.billingInterval,
        );
        const idempotencyKey = this.planChangeIdempotencyKey({
          organizationId: id,
          subscriptionId: subscription.stripeSubscriptionId!,
          previousPlanId: subscription.planId,
          planId: dto.planId,
          billingInterval: dto.billingInterval,
        });
        await this.stripe.upgradeSubscriptionPrice(
          subscription.stripeSubscriptionId!,
          priceId,
          idempotencyKey,
        );

        try {
          const updated =
            await this.subscriptionsService.updatePlanFromPlatformAdmin(
              id,
              plan,
              dto.billingInterval,
            );
          if (!updated)
            throw new Error('Subscription update matched no record');
        } catch (error) {
          this.logger.error(
            `Stripe plan changed but local subscription update failed: organizationId=${id}`,
          );
          await this.audits
            .create({
              organizationId: id,
              userId: actor.id,
              action: AUDIT_ACTION.SUBSCRIPTION_PLAN_RECONCILIATION_REQUIRED,
              resourceType: 'OrganizationSubscription',
              resourceId: String(subscription._id),
              metadata: {
                previousPlanId: subscription.planId,
                planId: dto.planId,
                billingInterval: dto.billingInterval,
                stripeSubscriptionId: subscription.stripeSubscriptionId,
                stripeIdempotencyKey: idempotencyKey,
              },
            })
            .catch(() => undefined);
          throw new ServiceUnavailableException(
            'The provider accepted this plan change but local synchronization is pending',
          );
        }
        await this.audits.create({
          organizationId: id,
          userId: actor.id,
          action: AUDIT_ACTION.SUBSCRIPTION_PLAN_CHANGED_BY_PLATFORM_ADMIN,
          resourceType: 'OrganizationSubscription',
          resourceId: String(subscription._id),
          metadata: {
            previousPlanId: subscription.planId,
            previousBillingInterval: subscription.billingInterval ?? 'month',
            planId: dto.planId,
            billingInterval: dto.billingInterval,
            stripeIdempotencyKey: idempotencyKey,
          },
        });
        return this.organizationActionResult(id, {
          type: 'PLAN_CHANGE',
          changed: true,
          duplicate: false,
        });
      },
    });
  }

  private async organizationActionResult(
    organizationId: string,
    operation: {
      type: 'STATUS_UPDATE' | 'PLAN_CHANGE';
      changed: boolean;
      duplicate: boolean;
    },
  ) {
    return {
      ...(await this.getById(organizationId)),
      operation,
    };
  }

  private planChangeIdempotencyKey(input: {
    organizationId: string;
    subscriptionId: string;
    previousPlanId: string;
    planId: string;
    billingInterval: 'month' | 'year';
  }) {
    const digest = crypto
      .createHash('sha256')
      .update(JSON.stringify(input))
      .digest('hex');
    return `admin-plan-change-${digest}`;
  }

  private async requireExternalOrganization(id: string) {
    const organization = await this.organizations.findById(id).lean().exec();
    if (!organization || this.isInternal(organization)) {
      throw new NotFoundException('Organization not found');
    }
    return organization;
  }

  private presentSubscription(value: unknown) {
    if (!value || typeof value !== 'object') return null;
    const subscription = value as Record<string, unknown>;
    if (
      !subscription.id ||
      !Object.values(SubscriptionStatus).includes(
        subscription.status as SubscriptionStatus,
      )
    ) {
      return null;
    }
    return presentAdminSubscription({
      ...subscription,
      status: subscription.status as SubscriptionStatus,
      pausedUntil: subscription.pausedUntil as Date | string | null | undefined,
    });
  }

  private baseMatch() {
    return {
      isInternal: { $ne: true },
      name: { $ne: PLATFORM_ORGANIZATION_NAME },
    };
  }

  private listFilters(
    query: ListOrganizationsAdminQueryDto,
    asOf: Date,
  ): PipelineStage[] {
    const filters: PipelineStage[] = [];
    if (query.search) {
      const escaped = query.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const pattern = { $regex: escaped, $options: 'i' };
      filters.push({
        $match: {
          $or: [
            { name: pattern },
            { emailAddress: pattern },
            { phoneNumber: pattern },
            {
              members: {
                $elemMatch: {
                  role: UserRole.OWNER,
                  $or: [
                    { firstName: pattern },
                    { lastName: pattern },
                    { email: pattern },
                    { phoneNumber: pattern },
                  ],
                },
              },
            },
          ],
        },
      });
    }
    if (query.status) filters.push({ $match: { status: query.status } });
    if (query.planType)
      filters.push({ $match: { 'plan.planType': query.planType } });
    if (query.subscriptionStatus) {
      filters.push({
        $match: { 'subscription.status': query.subscriptionStatus },
      });
    }
    if (
      query.subscriptionDisplayStatus === AdminSubscriptionDisplayStatus.PAUSED
    ) {
      filters.push({
        $match: { 'subscription.pausedUntil': { $gt: asOf } },
      });
    } else if (query.subscriptionDisplayStatus) {
      filters.push({
        $match: {
          'subscription.status': query.subscriptionDisplayStatus,
          $or: [
            { 'subscription.pausedUntil': { $exists: false } },
            { 'subscription.pausedUntil': null },
            { 'subscription.pausedUntil': { $lte: asOf } },
          ],
        },
      });
    }
    if (query.billingInterval) {
      filters.push({
        $match: { 'subscription.billingInterval': query.billingInterval },
      });
    }
    return filters;
  }

  private async summary(
    baseMatch: Record<string, unknown>,
    asOf: Date,
    timezone: string,
  ) {
    const currentPeriod = {
      from: new Date(asOf.getTime() - 7 * 24 * 60 * 60 * 1000),
      to: asOf,
    };
    const previousPeriod = {
      from: new Date(asOf.getTime() - 14 * 24 * 60 * 60 * 1000),
      to: currentPeriod.from,
    };
    const today = localDayRange(asOf, timezone);
    const [summary, currentActions, todaySuspensions] = await Promise.all([
      this.organizations.aggregate<{
        totalOrganizations: number;
        activeOrganizations: number;
        suspendedOrganizations: number;
        createdCurrentPeriod: number;
      }>([
        { $match: baseMatch },
        {
          $group: {
            _id: null,
            totalOrganizations: { $sum: 1 },
            activeOrganizations: {
              $sum: {
                $cond: [{ $eq: ['$status', OrganizationStatus.ACTIVE] }, 1, 0],
              },
            },
            suspendedOrganizations: {
              $sum: {
                $cond: [
                  { $eq: ['$status', OrganizationStatus.SUSPENDED] },
                  1,
                  0,
                ],
              },
            },
            createdCurrentPeriod: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      { $gte: ['$createdAt', currentPeriod.from] },
                      { $lt: ['$createdAt', currentPeriod.to] },
                    ],
                  },
                  1,
                  0,
                ],
              },
            },
          },
        },
        {
          $project: {
            _id: 0,
            totalOrganizations: 1,
            activeOrganizations: 1,
            suspendedOrganizations: 1,
            createdCurrentPeriod: 1,
          },
        },
      ]),
      this.audits.countByActions(
        [
          AUDIT_ACTION.ORGANIZATION_SUSPENDED_BY_PLATFORM_ADMIN,
          AUDIT_ACTION.ORGANIZATION_RESUMED_BY_PLATFORM_ADMIN,
        ],
        currentPeriod,
      ),
      this.audits.countByActions(
        [AUDIT_ACTION.ORGANIZATION_SUSPENDED_BY_PLATFORM_ADMIN],
        {
          from: today.start,
          to: today.end,
        },
      ),
    ]);
    const counts = summary[0] ?? {
      totalOrganizations: 0,
      activeOrganizations: 0,
      suspendedOrganizations: 0,
      createdCurrentPeriod: 0,
    };
    return buildAdminOrganizationSummary({
      asOf,
      timezone,
      currentPeriod,
      previousPeriod,
      ...counts,
      suspendedCurrentPeriod:
        currentActions[AUDIT_ACTION.ORGANIZATION_SUSPENDED_BY_PLATFORM_ADMIN] ??
        0,
      resumedCurrentPeriod:
        currentActions[AUDIT_ACTION.ORGANIZATION_RESUMED_BY_PLATFORM_ADMIN] ??
        0,
      suspendedToday:
        todaySuspensions[
          AUDIT_ACTION.ORGANIZATION_SUSPENDED_BY_PLATFORM_ADMIN
        ] ?? 0,
    });
  }

  private isInternal(organization: { name?: string; isInternal?: boolean }) {
    return (
      organization.isInternal === true ||
      organization.name === PLATFORM_ORGANIZATION_NAME
    );
  }
}
