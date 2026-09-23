import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model } from 'mongoose';
import {
  SupportAttachmentStatus,
  SupportRequestStatus,
} from '../../common/enums/support-request.enum';
import { SupportRequest } from '../../database/schemas/support-request.schema';
import { ListSupportRequestsAdminQueryDto } from './dto/list-support-requests-admin-query.dto';
import { ListSupportRequestsQueryDto } from './dto/list-support-requests-query.dto';

@Injectable()
export class SupportRequestsRepository {
  constructor(
    @InjectModel(SupportRequest.name)
    private readonly requests: Model<SupportRequest>,
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
      .lean()
      .exec();
  }

  findForAdmin(id: string) {
    return this.requests
      .findOne({ _id: id, deletedAt: { $exists: false } })
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
      .select(
        '+attachments.storageKey +attachments.storageAssetId +attachments.storageResourceType +attachments.storageDeliveryType +attachments.storageFormat',
      )
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
      .select(
        '+attachments.storageKey +attachments.storageAssetId +attachments.storageResourceType +attachments.storageDeliveryType +attachments.storageFormat',
      )
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
    return this.requests
      .findOneAndUpdate(
        { _id: id, deletedAt: { $exists: false } },
        {
          $set: {
            status,
            statusChangedAt: new Date(),
            statusChangedByUserId: adminUserId,
            ...(resolutionNote ? { resolutionNote } : {}),
          },
          ...(!resolutionNote && status === SupportRequestStatus.OPEN
            ? { $unset: { resolutionNote: 1 } }
            : {}),
        },
        { new: true, runValidators: true },
      )
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
        .select('-description -attachments')
        .sort({ updatedAt: -1, _id: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean()
        .exec(),
      this.requests.countDocuments(filter).exec(),
    ]);
    return { items, total };
  }
}
