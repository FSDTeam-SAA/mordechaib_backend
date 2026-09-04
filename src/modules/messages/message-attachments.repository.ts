import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { MessageAttachmentCategory } from '../../common/enums/message-attachment-category.enum';
import { MessageAttachmentStatus } from '../../common/enums/message-attachment-status.enum';
import { MessageProcessingStatus } from '../../common/enums/message-processing-status.enum';
import { MessageAttachment } from '../../database/schemas/message-attachment.schema';

export type CreateMessageAttachmentInput = {
  organizationId: string;
  messageId: string;
  category: MessageAttachmentCategory;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  checksumSha256: string;
  storageProvider: string;
  storageKey: string;
  storageAssetId?: string;
  storageResourceType: string;
  storageDeliveryType: string;
  storageFormat: string;
};

@Injectable()
export class MessageAttachmentsRepository {
  constructor(
    @InjectModel(MessageAttachment.name)
    private readonly attachmentModel: Model<MessageAttachment>,
  ) {}

  async createMany(inputs: CreateMessageAttachmentInput[]) {
    if (!inputs.length) return [];
    const attachments = await this.attachmentModel.insertMany(
      inputs.map((input) => ({
        ...input,
        status: MessageAttachmentStatus.ACTIVE,
        processingStatus: MessageProcessingStatus.NOT_REQUESTED,
      })),
    );
    return attachments.map((attachment) => attachment.toObject());
  }

  findByMessageIds(organizationId: string, messageIds: string[]) {
    if (!messageIds.length) return Promise.resolve([]);
    return this.attachmentModel
      .find({
        organizationId,
        messageId: { $in: messageIds },
        status: MessageAttachmentStatus.ACTIVE,
      })
      .sort({ createdAt: 1, _id: 1 })
      .lean()
      .exec();
  }

  findActiveWithStorage(
    organizationId: string,
    messageId: string,
    attachmentId: string,
  ) {
    return this.attachmentModel
      .findOne({
        _id: attachmentId,
        organizationId,
        messageId,
        status: MessageAttachmentStatus.ACTIVE,
      })
      .select(
        '+storageKey +storageAssetId +storageResourceType +storageDeliveryType +storageFormat',
      )
      .lean()
      .exec();
  }

  findCleanupCandidates(organizationId: string, messageId: string) {
    return this.attachmentModel
      .find({
        organizationId,
        messageId,
        status: {
          $in: [
            MessageAttachmentStatus.ACTIVE,
            MessageAttachmentStatus.DELETION_PENDING,
            MessageAttachmentStatus.DELETE_FAILED,
          ],
        },
      })
      .select(
        '+storageKey +storageAssetId +storageResourceType +storageDeliveryType +storageFormat',
      )
      .lean()
      .exec();
  }

  markDeletionPending(organizationId: string, messageId: string) {
    return this.attachmentModel
      .updateMany(
        {
          organizationId,
          messageId,
          status: {
            $in: [
              MessageAttachmentStatus.ACTIVE,
              MessageAttachmentStatus.DELETE_FAILED,
            ],
          },
        },
        {
          $set: { status: MessageAttachmentStatus.DELETION_PENDING },
          $unset: { deletionError: 1 },
        },
      )
      .exec();
  }

  markDeleted(attachmentId: string) {
    return this.attachmentModel
      .updateOne(
        { _id: attachmentId },
        {
          $set: {
            status: MessageAttachmentStatus.DELETED,
            deletedAt: new Date(),
          },
          $unset: { deletionError: 1 },
        },
      )
      .exec();
  }

  markDeleteFailed(attachmentId: string, message: string) {
    return this.attachmentModel
      .updateOne(
        { _id: attachmentId },
        {
          $set: {
            status: MessageAttachmentStatus.DELETE_FAILED,
            deletionError: message.slice(0, 500),
          },
        },
      )
      .exec();
  }

  async hardDeleteByMessage(messageId: string): Promise<void> {
    await this.attachmentModel.deleteMany({ messageId }).exec();
  }
}
