import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { MessageProcessingStatus } from '../../common/enums/message-processing-status.enum';
import { MessageSenderType } from '../../common/enums/message-sender-type.enum';
import { MessageType } from '../../common/enums/message-type.enum';
import { Message } from '../../database/schemas/message.schema';

type CreateMessageInput = {
  organizationId: string;
  conversationId: string;
  senderId: string;
  clientMessageId?: string;
  content?: string;
  type: MessageType;
  attachmentCount: number;
};

@Injectable()
export class MessagesRepository {
  constructor(
    @InjectModel(Message.name)
    private readonly messageModel: Model<Message>,
  ) {}

  async create(input: CreateMessageInput) {
    const message = await this.messageModel.create({
      ...input,
      senderType: MessageSenderType.USER,
      processingStatus: MessageProcessingStatus.NOT_REQUESTED,
    });
    return message.toObject();
  }

  async list(
    organizationId: string,
    conversationId: string,
    page: number,
    limit: number,
  ) {
    const filter = {
      organizationId,
      conversationId,
      deletedAt: { $exists: false },
    };
    const [items, total] = await Promise.all([
      this.messageModel
        .find(filter)
        .sort({ createdAt: -1, _id: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean()
        .exec(),
      this.messageModel.countDocuments(filter).exec(),
    ]);
    return { items, total };
  }

  findActiveById(organizationId: string, messageId: string) {
    return this.messageModel
      .findOne({
        _id: messageId,
        organizationId,
        deletedAt: { $exists: false },
      })
      .lean()
      .exec();
  }

  findByClientMessageId(organizationId: string, clientMessageId: string) {
    return this.messageModel
      .findOne({ organizationId, clientMessageId })
      .lean()
      .exec();
  }

  findForDeletion(organizationId: string, messageId: string) {
    return this.messageModel
      .findOne({ _id: messageId, organizationId })
      .lean()
      .exec();
  }

  softDelete(organizationId: string, messageId: string, deletedBy: string) {
    return this.messageModel
      .findOneAndUpdate(
        {
          _id: messageId,
          organizationId,
          deletedAt: { $exists: false },
        },
        { $set: { deletedAt: new Date(), deletedBy } },
        { new: true },
      )
      .lean()
      .exec();
  }

  async hardDelete(messageId: string): Promise<void> {
    await this.messageModel.deleteOne({ _id: messageId }).exec();
  }
}
