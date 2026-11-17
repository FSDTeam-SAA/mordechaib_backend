import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model } from 'mongoose';
import {
  SupportRequestActorType,
  SupportAttachmentStatus,
  SupportRequestEventType,
  SupportRequestPriority,
  SupportRequestStatus,
} from '../../common/enums/support-request.enum';
import { UserStatus } from '../../common/enums/user-status.enum';
import { Organization } from '../../database/schemas/organization.schema';
import { SupportRequest } from '../../database/schemas/support-request.schema';
import { User } from '../../database/schemas/user.schema';
import { ListSupportRequestsAdminQueryDto } from './dto/list-support-requests-admin-query.dto';
import { ListSupportRequestsQueryDto } from './dto/list-support-requests-query.dto';
import { ManageSupportRequestDto } from './dto/manage-support-request.dto';

const ATTACHMENT_STORAGE_SELECTION =
  '+attachments.storageKey +attachments.storageAssetId +attachments.storageResourceType +attachments.storageDeliveryType +attachments.storageFormat';

@Injectable()
export class SupportRequestsRepository {
  constructor(
    @InjectModel(SupportRequest.name)
    private readonly requests: Model<SupportRequest>,
    @InjectModel(User.name)
    private readonly users: Model<User>,
    @InjectModel(Organization.name)
    private readonly organizations: Model<Organization>,
  ) {}

  async create(input: Record<string, unknown>) {
    const request = await this.requests.create(input);
    return request.toObject();
  }

  async listForUser(
    organizationId: string,
    userId: string,
    query: ListSupportRequestsQueryDto,
  ) {
    return this.list(
      {
        organizationId,
        createdByUserId: userId,
        deletedAt: { $exists: false },
        ...(query.status ? { status: query.status } : {}),
        ...(query.category ? { category: query.category } : {}),
      },
      query.page,
      query.limit,
    );
  }

  async listForAdmin(query: ListSupportRequestsAdminQueryDto) {
    const escapedSearch = query.search
      ?.trim()
      .replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const references = escapedSearch
      ? await this.findAdminSearchReferences(escapedSearch)
      : undefined;
    return this.list(
      {
        deletedAt: { $exists: false },
        ...(query.organizationId
          ? { organizationId: query.organizationId }
          : {}),
        ...(query.createdByUserId
          ? { createdByUserId: query.createdByUserId }
          : {}),
        ...(query.status ? { status: query.status } : {}),
        ...(query.category ? { category: query.category } : {}),
        ...(escapedSearch
          ? {
              $or: [
                { ticketId: { $regex: escapedSearch, $options: 'i' } },
                { subject: { $regex: escapedSearch, $options: 'i' } },
                ...(references?.organizationIds.length
                  ? [{ organizationId: { $in: references.organizationIds } }]
                  : []),
                ...(references?.userIds.length
                  ? [{ createdByUserId: { $in: references.userIds } }]
                  : []),
              ],
            }
          : {}),
      },
      query.page,
      query.limit,
    );
  }

  findForUser(organizationId: string, userId: string, id: string) {
    return this.requests
      .findOne({
        _id: id,
        organizationId,
        createdByUserId: userId,
        deletedAt: { $exists: false },
      })
      .select(ATTACHMENT_STORAGE_SELECTION)
      .lean()
      .exec();
  }

  findForAdmin(id: string) {
    return this.requests
      .findOne({ _id: id, deletedAt: { $exists: false } })
      .select(ATTACHMENT_STORAGE_SELECTION)
      .lean()
      .exec();
  }

  findAttachmentForUser(
    organizationId: string,
    userId: string,
    requestId: string,
    attachmentId: string,
  ) {
    return this.requests
      .findOne({
        _id: requestId,
        organizationId,
        createdByUserId: userId,
        deletedAt: { $exists: false },
        attachments: {
          $elemMatch: {
            _id: attachmentId,
            status: SupportAttachmentStatus.ACTIVE,
          },
        },
      })
      .select(ATTACHMENT_STORAGE_SELECTION)
      .lean()
      .exec();
  }

  findAttachmentForAdmin(requestId: string, attachmentId: string) {
    return this.requests
      .findOne({
        _id: requestId,
        deletedAt: { $exists: false },
        attachments: {
          $elemMatch: {
            _id: attachmentId,
            status: SupportAttachmentStatus.ACTIVE,
          },
        },
      })
      .select(ATTACHMENT_STORAGE_SELECTION)
      .lean()
      .exec();
  }

  softDelete(
    organizationId: string,
    userId: string,
    id: string,
    deletedAt: Date,
  ) {
    return this.requests
      .findOneAndUpdate(
        {
          _id: id,
          organizationId,
          createdByUserId: userId,
          deletedAt: { $exists: false },
        },
        {
          $set: {
            deletedAt,
            deletedByUserId: userId,
            'attachments.$[attachment].status':
              SupportAttachmentStatus.DELETION_PENDING,
          },
        },
        {
          new: true,
          arrayFilters: [
            { 'attachment.status': SupportAttachmentStatus.ACTIVE },
          ],
        },
      )
      .select(
        '+attachments.storageKey +attachments.storageAssetId +attachments.storageResourceType +attachments.storageDeliveryType +attachments.storageFormat',
      )
      .lean()
      .exec();
  }

  markAttachmentDeleted(requestId: string, attachmentId: string) {
    return this.requests
      .updateOne(
        { _id: requestId, 'attachments._id': attachmentId },
        {
          $set: {
            'attachments.$.status': SupportAttachmentStatus.DELETED,
            'attachments.$.deletedAt': new Date(),
          },
          $unset: { 'attachments.$.deletionError': 1 },
        },
      )
      .exec();
  }

  markAttachmentDeleteFailed(
    requestId: string,
    attachmentId: string,
    message: string,
  ) {
    return this.requests
      .updateOne(
        { _id: requestId, 'attachments._id': attachmentId },
        {
          $set: {
            'attachments.$.status': SupportAttachmentStatus.DELETE_FAILED,
            'attachments.$.deletionError': message.slice(0, 500),
          },
        },
      )
      .exec();
  }

  updateStatus(
    id: string,
    status: SupportRequestStatus,
    resolutionNote: string | undefined,
    adminUserId: string,
  ) {
    return this.manage(id, { status, resolutionNote }, adminUserId);
  }

  async manage(
    id: string,
    input: ManageSupportRequestDto,
    adminUserId: string,
  ) {
    const current = await this.requests
      .findOne({ _id: id, deletedAt: { $exists: false } })
      .lean()
      .exec();
    if (!current) return null;

    const now = new Date();
    const set: Record<string, unknown> = {};
    const unset: Record<string, 1> = {};
    const timeline: Array<Record<string, unknown>> = [];

    if (input.status && input.status !== current.status) {
      set.status = input.status;
      set.statusChangedAt = now;
      set.statusChangedByUserId = adminUserId;
      timeline.push({
        type: SupportRequestEventType.STATUS_CHANGED,
        actorUserId: adminUserId,
        actorType: SupportRequestActorType.PLATFORM_ADMIN,
        fromValue: current.status,
        toValue: input.status,
        createdAt: now,
      });
    }
    if (input.priority && input.priority !== current.priority) {
      set.priority = input.priority;
      timeline.push({
        type: SupportRequestEventType.PRIORITY_CHANGED,
        actorUserId: adminUserId,
        actorType: SupportRequestActorType.PLATFORM_ADMIN,
        fromValue: current.priority || SupportRequestPriority.MEDIUM,
        toValue: input.priority,
        createdAt: now,
      });
    }
    if (
      input.assignedToUserId !== undefined &&
      input.assignedToUserId !== current.assignedToUserId
    ) {
      if (input.assignedToUserId === null) unset.assignedToUserId = 1;
      else set.assignedToUserId = input.assignedToUserId;
      timeline.push({
        type: SupportRequestEventType.ASSIGNED,
        actorUserId: adminUserId,
        actorType: SupportRequestActorType.PLATFORM_ADMIN,
        fromValue: current.assignedToUserId,
        toValue: input.assignedToUserId || 'UNASSIGNED',
        createdAt: now,
      });
    }
    if (input.resolutionNote) set.resolutionNote = input.resolutionNote;
    if (!input.resolutionNote && input.status === SupportRequestStatus.OPEN) {
      unset.resolutionNote = 1;
    }

    return this.requests
      .findOneAndUpdate(
        { _id: id, deletedAt: { $exists: false } },
        {
          ...(Object.keys(set).length ? { $set: set } : {}),
          ...(Object.keys(unset).length ? { $unset: unset } : {}),
          ...(timeline.length ? { $push: { timeline: { $each: timeline } } } : {}),
        },
        { new: true, runValidators: true },
      )
      .select(ATTACHMENT_STORAGE_SELECTION)
      .lean()
      .exec();
  }

  addReplyForUser(
    organizationId: string,
    userId: string,
    id: string,
    content: string,
    currentStatus: SupportRequestStatus,
  ) {
    const now = new Date();
    const reopens = currentStatus === SupportRequestStatus.RESOLVED;
    const timeline = [
      {
        type: SupportRequestEventType.REPLIED,
        actorUserId: userId,
        actorType: SupportRequestActorType.ORGANIZER,
        createdAt: now,
      },
      ...(reopens
        ? [
            {
              type: SupportRequestEventType.STATUS_CHANGED,
              actorUserId: userId,
              actorType: SupportRequestActorType.ORGANIZER,
              fromValue: SupportRequestStatus.RESOLVED,
              toValue: SupportRequestStatus.OPEN,
              createdAt: now,
            },
          ]
        : []),
    ];
    return this.requests
      .findOneAndUpdate(
        {
          _id: id,
          organizationId,
          createdByUserId: userId,
          deletedAt: { $exists: false },
          status: { $ne: SupportRequestStatus.CLOSED },
        },
        {
          $push: {
            replies: {
              authorUserId: userId,
              authorType: SupportRequestActorType.ORGANIZER,
              content,
              createdAt: now,
            },
            timeline: { $each: timeline },
          },
          ...(reopens
            ? {
                $set: {
                  status: SupportRequestStatus.OPEN,
                  statusChangedAt: now,
                  statusChangedByUserId: userId,
                },
                $unset: { resolutionNote: 1 },
              }
            : {}),
        },
        { new: true, runValidators: true },
      )
      .select(ATTACHMENT_STORAGE_SELECTION)
      .lean()
      .exec();
  }

  addReplyForAdmin(id: string, adminUserId: string, content: string) {
    const now = new Date();
    return this.requests
      .findOneAndUpdate(
        {
          _id: id,
          deletedAt: { $exists: false },
          status: { $ne: SupportRequestStatus.CLOSED },
        },
        {
          $push: {
            replies: {
              authorUserId: adminUserId,
              authorType: SupportRequestActorType.PLATFORM_ADMIN,
              content,
              createdAt: now,
            },
            timeline: {
              type: SupportRequestEventType.REPLIED,
              actorUserId: adminUserId,
              actorType: SupportRequestActorType.PLATFORM_ADMIN,
              createdAt: now,
            },
          },
        },
        { new: true, runValidators: true },
      )
      .select(ATTACHMENT_STORAGE_SELECTION)
      .lean()
      .exec();
  }

  async summaryForAdmin() {
    const counts = await this.requests
      .aggregate<{ _id: SupportRequestStatus; count: number }>([
        { $match: { deletedAt: { $exists: false } } },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ])
      .exec();
    const byStatus = new Map(counts.map((item) => [item._id, item.count]));
    const count = (status: SupportRequestStatus) => byStatus.get(status) || 0;
    return {
      total: counts.reduce((sum, item) => sum + item.count, 0),
      open: count(SupportRequestStatus.OPEN),
      inProgress: count(SupportRequestStatus.IN_PROGRESS),
      resolved: count(SupportRequestStatus.RESOLVED),
      closed: count(SupportRequestStatus.CLOSED),
    };
  }

  findAssignableAdmin(userId: string) {
    return this.users
      .findOne({
        _id: userId,
        isPlatformAdmin: true,
        status: UserStatus.ACTIVE,
      })
      .select('_id firstName lastName email avatarUrl')
      .lean()
      .exec();
  }

  listAssignableAdmins() {
    return this.users
      .find({ isPlatformAdmin: true, status: UserStatus.ACTIVE })
      .select('_id firstName lastName email avatarUrl')
      .sort({ firstName: 1, lastName: 1, _id: 1 })
      .lean()
      .exec();
  }

  findUsersByIds(ids: string[]) {
    if (!ids.length) return Promise.resolve([]);
    return this.users
      .find({ _id: { $in: ids } })
      .select('_id firstName lastName email avatarUrl isPlatformAdmin')
      .lean()
      .exec();
  }

  findOrganizationsByIds(ids: string[]) {
    if (!ids.length) return Promise.resolve([]);
    return this.organizations
      .find({ _id: { $in: ids } })
      .select('_id name')
      .lean()
      .exec();
  }

  private async list(
    filter: FilterQuery<SupportRequest>,
    page: number,
    limit: number,
  ) {
    const [items, total] = await Promise.all([
      this.requests
        .find(filter)
        .select(
          'ticketId organizationId createdByUserId category subject status priority assignedToUserId resolutionNote statusChangedAt attachmentCount createdAt updatedAt',
        )
        .sort({ updatedAt: -1, _id: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean()
        .exec(),
      this.requests.countDocuments(filter).exec(),
    ]);
    return { items, total };
  }

  private async findAdminSearchReferences(search: string) {
    const regex = { $regex: search, $options: 'i' };
    const [organizations, users] = await Promise.all([
      this.organizations.find({ name: regex }).select('_id').lean().exec(),
      this.users
        .find({ $or: [{ firstName: regex }, { lastName: regex }, { email: regex }] })
        .select('_id')
        .lean()
        .exec(),
    ]);
    return {
      organizationIds: organizations.map((item) => String(item._id)),
      userIds: users.map((item) => String(item._id)),
    };
  }
}
