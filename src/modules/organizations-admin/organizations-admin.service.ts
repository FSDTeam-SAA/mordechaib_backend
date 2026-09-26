import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, PipelineStage } from 'mongoose';
import { OrganizationStatus } from '../../common/enums/organization-status.enum';
import { UserRole } from '../../common/enums/user-role.enum';
import { RequestUser } from '../../common/types/request-context.type';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { IntegrationsService } from '../integrations/integrations.service';
import { StripeProvider } from '../stripe/stripe.provider';
import { SubscriptionPlansService } from '../subscriptions/subscription-plans.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { ManagedCalendarEvent } from '../../database/schemas/managed-calendar-event.schema';
import { Organization } from '../../database/schemas/organization.schema';
import { OrganizationSubscription } from '../../database/schemas/organization-subscription.schema';
import { PlatformMeeting } from '../../database/schemas/platform-meeting.schema';
import { TaskItem } from '../../database/schemas/task-item.schema';
import { User } from '../../database/schemas/user.schema';
import { ChangeOrganizationPlanDto } from './dto/change-organization-plan.dto';
import { ListOrganizationsAdminQueryDto } from './dto/list-organizations-admin-query.dto';
import { UpdateOrganizationStatusDto } from './dto/update-organization-status.dto';

const PLATFORM_ORGANIZATION_NAME = 'Noltra Platform Team';

@Injectable()
export class OrganizationsAdminService {
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
    private readonly plans: SubscriptionPlansService,
    private readonly subscriptionsService: SubscriptionsService,
    private readonly stripe: StripeProvider,
    private readonly integrations: IntegrationsService,
    private readonly audits: AuditLogsService,
  ) {}

  async list(query: ListOrganizationsAdminQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const baseMatch = this.baseMatch();
    const pipeline = [
      { $match: baseMatch },
      {
        $lookup: {
          from: 'users',
          let: { organizationId: { $toString: '$_id' } },
          pipeline: [
            { $match: { $expr: { $eq: ['$organizationId', '$$organizationId'] } } },
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
            { $match: { $expr: { $eq: ['$organizationId', '$$organizationId'] } } },
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
      ...this.listFilters(query),
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
                      name: { $concat: ['$$owner.firstName', ' ', '$$owner.lastName'] },
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
      this.summary(baseMatch),
    ]);
    const result = results[0];
    const total = result?.total[0]?.count ?? 0;

    return {
      summary,
      items: result?.items ?? [],
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getById(id: string) {
    const organization = await this.organizations
      .findOne({ _id: id, ...this.baseMatch() })
      .lean()
      .exec();
    if (!organization) throw new NotFoundException('Organization not found');

    const organizationId = String(organization._id);
    const [members, subscription, taskCount, platformMeetings, calendarEvents] =
      await Promise.all([
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
      ]);
    const owner = members.find((member) => member.role === UserRole.OWNER) ?? members[0];
    const [plan, connectedTools] = await Promise.all([
      subscription ? this.plans.findById(subscription.planId) : Promise.resolve(null),
      owner
        ? this.integrations.findAll(organizationId, String(owner._id))
        : Promise.resolve({ organizationId, items: [] }),
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
        ? {
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
          }
        : null,
      metrics: {
        tasksCreated: { availability: 'AVAILABLE', value: taskCount },
        meetings: { availability: 'AVAILABLE', value: meetingKeys.size },
        crmContacts: {
          availability: 'UNAVAILABLE',
          value: null,
          reason: 'CRM contacts are not persisted by this platform.',
        },
        roiReports: {
          availability: 'UNAVAILABLE',
          value: null,
          reason: 'ROI reports are not persisted by this platform.',
        },
      },
      connectedTools,
    };
  }

  async updateStatus(
    id: string,
    dto: UpdateOrganizationStatusDto,
    actor: RequestUser,
  ) {
    const organization = await this.organizations.findById(id).lean().exec();
    if (!organization || this.isInternal(organization)) {
      throw new NotFoundException('Organization not found');
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
            $unset: { suspendedAt: 1, suspendedBy: 1, suspendedReason: 1 },
          };
    await this.organizations.findByIdAndUpdate(id, update, { runValidators: true }).exec();
    await this.audits.create({
      organizationId: id,
      userId: actor.id,
      action:
        dto.status === OrganizationStatus.SUSPENDED
          ? 'ORGANIZATION_SUSPENDED_BY_PLATFORM_ADMIN'
          : 'ORGANIZATION_RESUMED_BY_PLATFORM_ADMIN',
      resourceType: 'Organization',
      resourceId: id,
      metadata: reason ? { reason } : undefined,
    });
    return this.getById(id);
  }

  async changePlan(
    id: string,
    dto: ChangeOrganizationPlanDto,
    actor: RequestUser,
  ) {
    const organization = await this.organizations.findById(id).lean().exec();
    if (!organization || this.isInternal(organization)) {
      throw new NotFoundException('Organization not found');
    }
    const subscription = await this.subscriptions.findOne({ organizationId: id }).lean().exec();
    if (!subscription?.stripeSubscriptionId) {
      throw new BadRequestException(
        'This organization has no Stripe subscription to change. Create its subscription through checkout first.',
      );
    }
    const plan = await this.plans.findById(dto.planId);
    if (plan.isInquiryOnly) {
      throw new BadRequestException('Inquiry-only plans cannot be assigned directly');
    }
    const priceId = await this.plans.ensureCheckoutPrice(dto.planId, dto.billingInterval);
    await this.stripe.upgradeSubscriptionPrice(subscription.stripeSubscriptionId, priceId);
    await this.subscriptionsService.updatePlanFromPlatformAdmin(id, plan, dto.billingInterval);
    await this.audits.create({
      organizationId: id,
      userId: actor.id,
      action: 'SUBSCRIPTION_PLAN_CHANGED_BY_PLATFORM_ADMIN',
      resourceType: 'OrganizationSubscription',
      resourceId: String(subscription._id),
      metadata: {
        previousPlanId: subscription.planId,
        planId: dto.planId,
        billingInterval: dto.billingInterval,
      },
    });
    return this.getById(id);
  }

  private baseMatch() {
    return {
      isInternal: { $ne: true },
      name: { $ne: PLATFORM_ORGANIZATION_NAME },
    };
  }

  private listFilters(query: ListOrganizationsAdminQueryDto): PipelineStage[] {
    const filters: PipelineStage[] = [];
    if (query.search) {
      const escaped = query.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filters.push({ $match: { name: { $regex: escaped, $options: 'i' } } });
    }
    if (query.status) filters.push({ $match: { status: query.status } });
    if (query.planType) filters.push({ $match: { 'plan.planType': query.planType } });
    if (query.subscriptionStatus) {
      filters.push({ $match: { 'subscription.status': query.subscriptionStatus } });
    }
    if (query.billingInterval) {
      filters.push({ $match: { 'subscription.billingInterval': query.billingInterval } });
    }
    return filters;
  }

  private async summary(baseMatch: Record<string, unknown>) {
    const [summary] = await this.organizations.aggregate<{
      totalOrganizations: number;
      activeOrganizations: number;
      suspendedOrganizations: number;
    }>([
      { $match: baseMatch },
      {
        $group: {
          _id: null,
          totalOrganizations: { $sum: 1 },
          activeOrganizations: {
            $sum: { $cond: [{ $eq: ['$status', OrganizationStatus.ACTIVE] }, 1, 0] },
          },
          suspendedOrganizations: {
            $sum: { $cond: [{ $eq: ['$status', OrganizationStatus.SUSPENDED] }, 1, 0] },
          },
        },
      },
      { $project: { _id: 0, totalOrganizations: 1, activeOrganizations: 1, suspendedOrganizations: 1 } },
    ]);
    return summary ?? {
      totalOrganizations: 0,
      activeOrganizations: 0,
      suspendedOrganizations: 0,
    };
  }

  private isInternal(organization: { name?: string; isInternal?: boolean }) {
    return organization.isInternal === true || organization.name === PLATFORM_ORGANIZATION_NAME;
  }
}
